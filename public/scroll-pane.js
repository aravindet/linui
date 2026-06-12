const html = String.raw;
const css = String.raw;

const template = document.createElement("template");
const style = css`
	:host {
		display: block;
		position: relative;
		overflow: hidden;
	}

	.scroll-container {
		position: absolute;
		inset: 0;
		overflow: auto;
		overflow-anchor: none;
	}
`;
template.innerHTML = html`
	<style>${style}</style>
	<div class="scroll-container" part="scroll-container">
		<div class="scroll-content">
			<slot></slot>
		</div>
	</div>
`;

class ScrollPane extends HTMLElement {
	#container;
	#content;
	#slot;

	#visibleChildren = new Map();
	#observedChildren = new Set();

	#anchor = { element: null, position: 0 };
	#nextAnchor;
	#anchorFreeze = null;

	#isMutationScroll = false;
	#lastScrollTop = 0;
	#lastScrollDelta = 0;

	#resizeObserver = null;
	#intersectionObserver = null;

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.appendChild(template.content.cloneNode(true));
		this.#container = this.shadowRoot.querySelector(".scroll-container");
		this.#content = this.shadowRoot.querySelector(".scroll-content");
		this.#slot = this.shadowRoot.querySelector("slot");
		this.#resizeObserver = new ResizeObserver(this.#onResize);
		this.#intersectionObserver = new IntersectionObserver(
			this.#onIntersection,
			{ root: this.#container },
		);
	}

	connectedCallback() {
		this.#container.addEventListener("scroll", this.#onScroll);
		this.addEventListener("mousedown", this.#onMouseDown);
		this.addEventListener("mousemove", this.#onMouseMove);
		this.addEventListener("mouseleave", this.#onMouseLeave);
		this.#slot.addEventListener("slotchange", this.#onSlotChange);
	}

	disconnectedCallback() {
		this.#container.removeEventListener("scroll", this.#onScroll);
		this.removeEventListener("mousedown", this.#onMouseDown);
		this.removeEventListener("mousemove", this.#onMouseMove);
		this.removeEventListener("mouseleave", this.#onMouseLeave);
		this.#slot.removeEventListener("slotchange", this.#onSlotChange);
		if (this.#anchorFreeze) clearTimeout(this.#anchorFreeze);
	}

	#getContentTop = (el) => {
		const containerTop = this.#container.getBoundingClientRect().top;
		const { top } = el.getBoundingClientRect();
		const { scrollTop } = this.#container;
		const padTop = parseFloat(this.#content.style.paddingTop) || 0;
		return top - containerTop + scrollTop - padTop;
	};

	#getViewTop = (el) => {
		return el.getBoundingClientRect().top;
	};

	#debounceTimer;
	#onIntersection = (entries) => {
		// console.log("intersectionobserver");
		let change = false;
		for (const { target, isIntersecting } of entries) {
			if (isIntersecting) {
				this.#visibleChildren.set(target, this.#getContentTop(target));
				change = true;
			} else if (this.#visibleChildren.has(target)) {
				this.#visibleChildren.delete(target);
				change = true;
			}
		}
		if (change) {
			if (this.#debounceTimer) clearTimeout(this.#debounceTimer);
			this.#debounceTimer = setTimeout(
				() => this.dispatchEvent(new Event("visibleChildrenChange")),
				10,
			);
		}
	};

	#onResize = (_entries) => {
		this.#isMutationScroll = true;
		requestAnimationFrame(() => {
			this.#isMutationScroll = false;
		});

		// requestAnimationFrame(() => {
		if (this.#anchor.element?.isConnected) {
			const currentTop = this.#getViewTop(this.#anchor.element);
			const delta = currentTop - this.#anchor.position;
			this.#scrollPad(delta);
			return;
		}

		const deltaStats = new Map();
		let modalBucket = null;
		for (const [el, storedTop] of this.#visibleChildren) {
			const currentTop = this.#getContentTop(el);
			const delta = currentTop - storedTop;
			const bucket = Math.round(delta);
			const [n = 0, sum = 0] = deltaStats.get(bucket) ?? [];
			deltaStats.set(bucket, [n + 1, sum + delta]);
			if (modalBucket == null || n + 1 > deltaStats.get(modalBucket)[0]) {
				modalBucket = bucket;
			}
			this.#visibleChildren.set(el, currentTop);
		}

		/*  scrollPad(0) is NOT a no-op; it adds top and bottom
        padding in response to a few elements resizing while
        most others remain in place.  */
		if (modalBucket != null) {
			const [n, sum] = deltaStats.get(modalBucket);
			// console.log("resize:visible", modalBucket, n, this.#lastScrollDelta);
			this.#scrollPad(sum / n);
		}
		// });
	};

	#onSlotChange = () => {
		const next = new Set(this.#slot.assignedElements());
		let hasUnobservedRemovals = false;
		for (const el of this.#observedChildren) {
			if (next.has(el)) continue;
			this.#resizeObserver.unobserve(el);
			this.#intersectionObserver.unobserve(el);
			this.#visibleChildren.delete(el);
			hasUnobservedRemovals = true;
		}

		for (const el of next) {
			if (this.#observedChildren.has(el)) continue;
			this.#resizeObserver.observe(el, { box: "border-box" });
			this.#intersectionObserver.observe(el);
			hasUnobservedRemovals = false; // Adding an observer makes the call.
		}

		this.#observedChildren = next;
		if (hasUnobservedRemovals) this.#onResize();
	};

	get visibleChildren() {
		return this.#visibleChildren.keys();
	}

	#anchorChangeTimer;

	#setAnchor(element, override = false) {
		if (this.#anchorChangeTimer) {
			clearTimeout(this.#anchorChangeTimer);
			this.#anchorChangeTimer = null;
		}

		if (this.#anchorFreeze && !override) {
			this.#nextAnchor = element;
		} else {
			const position = element ? this.#getViewTop(element) : 0;
			this.#anchor = { element, position };
			this.#nextAnchor = undefined;
		}
	}

	#scheduleAnchor = (element, override) => {
		if (this.#anchorChangeTimer) clearTimeout(this.#anchorChangeTimer);
		this.#anchorChangeTimer = setTimeout(
			() => this.#setAnchor(element, override),
			50,
		);
	};

	#onScroll = () => {
		console.log("scroll", this.#isMutationScroll);
		this.#lastScrollDelta = this.#container.scrollTop - this.#lastScrollTop;
		this.#lastScrollTop = this.#container.scrollTop;
		if (this.#isMutationScroll) return;
		this.#setAnchor(null, true);
		this.#scrollPad(0); // Remove any unnecessary paddings.
	};

	#onMouseDown = (e) => this.#setAnchor(e.target, true);
	#onMouseMove = (e) => this.#scheduleAnchor(e.target, false);
	#onMouseLeave = () => this.#setAnchor(null);

	#unfreezeAnchor = () => {
		if (this.#nextAnchor === null) {
			// console.log("unfreeze: clearing anchor");
			this.#anchor = { element: null, position: 0 };
		} else if (this.#nextAnchor !== undefined) {
			const element = this.#nextAnchor;
			const position = element ? this.#getViewTop(element) : 0;
			// console.log("unfreeze: anchoring", element, "to", position);
			this.#anchor = { element, position };
		}
		this.#nextAnchor = undefined;
		this.#anchorFreeze = null;
	};

	#scrollPad = (delta = 0) => {
		// If scrolled to the bottom, suppress scroll up.
		const atBottom =
			this.#container.scrollTop + this.#container.clientHeight >
			this.#container.scrollHeight - 0.5;

		const contentStyle = this.#content.style;
		const curPadTop = parseFloat(contentStyle.paddingTop) || 0;
		const curPadBottom = parseFloat(contentStyle.paddingBottom) || 0;
		const conHeight = this.#container.scrollHeight - curPadTop - curPadBottom;

		const viewTop = this.#container.scrollTop - curPadTop;
		const viewBottom = viewTop + this.#container.clientHeight;
		const contentAbove = viewTop + delta;
		const contentBelow = conHeight - viewBottom - delta;

		const padTop = Math.max(0, -contentAbove);
		const padBottom = Math.max(0, -contentBelow);
		const scrollTop = contentAbove + padTop;

		contentStyle.paddingTop = `${padTop}px`;
		contentStyle.paddingBottom = `${padBottom}px`;
		if (
			(!atBottom || delta >= 0 || this.#lastScrollDelta <= 0) &&
			Math.abs(this.#container.scrollTop - scrollTop) > 0.5
		) {
			// console.log("scrollPad scroll", reason, {
			// 	delta,
			// 	padTopDelta: padTop - curPadTop,
			// 	padBottomDelta: padBottom - curPadBottom,
			// 	scrollTopDelta: -this.#container.scrollTop + scrollTop,
			// });

			this.#container.scrollTop = scrollTop;
		}

		// Freeze the effective anchor for 50s after any resize
		if (this.#anchorFreeze) clearTimeout(this.#anchorFreeze);
		this.#anchorFreeze = setTimeout(this.#unfreezeAnchor, 50);
	};
}

customElements.define("scroll-pane", ScrollPane);
