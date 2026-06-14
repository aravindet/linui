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
		scroll-snap-type: y proximity;
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

	#padTop = 0;
	#padBottom = 0;

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
		this.#resizeObserver.disconnect();
		this.#intersectionObserver.disconnect();
		this.#observedChildren = new Set();
		this.#visibleChildren.clear();
	}

	#getContentTop = (el) => {
		const containerTop = this.#container.getBoundingClientRect().top;
		const { top } = el.getBoundingClientRect();
		const { scrollTop } = this.#container;
		return top - containerTop + scrollTop - this.#padTop;
	};

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
		if (change) this.dispatchEvent(new Event("visibleChildrenChange"));
	};

	#onResize = (_entries) => {
		this.#isMutationScroll = true;
		requestAnimationFrame(() => {
			this.#isMutationScroll = false;
		});

		if (this.#anchor.element?.isConnected) {
			const { top } = this.#anchor.element.getBoundingClientRect();
			const delta = top - this.#anchor.position;
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
	};

	#onSlotChange = () => {
		const next = new Set(this.#slot.assignedElements());
		let hasRemovals = false;
		for (const el of this.#observedChildren) {
			if (next.has(el)) continue;
			this.#resizeObserver.unobserve(el);
			this.#intersectionObserver.unobserve(el);
			this.#visibleChildren.delete(el);
			hasRemovals = true;
		}

		let hasAdditions = false;
		for (const el of next) {
			if (this.#observedChildren.has(el)) continue;
			this.#resizeObserver.observe(el, { box: "border-box" });
			this.#intersectionObserver.observe(el);
			hasAdditions = true;
		}

		this.#observedChildren = next;
		if (hasRemovals && !hasAdditions) this.#onResize();
	};

	get visibleChildren() {
		return this.#visibleChildren.keys();
	}

	get viewHeight() {
		return this.#container.clientHeight;
	}

	get viewTop() {
		return this.#container.scrollTop - this.#padTop;
	}

	get viewBottom() {
		return this.viewTop + this.viewHeight;
	}

	get contentHeight() {
		return this.#container.scrollHeight - this.#padTop - this.#padBottom;
	}

	#setAnchor(element, override = false) {
		if (this.#anchorFreeze && !override) {
			this.#nextAnchor = element;
		} else {
			const { top: position = 0 } = element?.getBoundingClientRect() ?? {};
			this.#anchor = { element, position };
			this.#nextAnchor = undefined;
		}
	}

	#onScroll = () => {
		const { scrollTop } = this.#container;
		this.#lastScrollDelta = scrollTop - this.#lastScrollTop;
		this.#lastScrollTop = scrollTop;
		if (this.#isMutationScroll) return;
		this.#setAnchor(null, true);

		// Reduce or remove paddings.
		if (this.#padTop || this.#padBottom) this.#scrollPad(0);
	};

	#onMouseDown = (e) => this.#setAnchor(e.target, true);
	#onMouseMove = (e) => this.#setAnchor(e.target, false);
	#onMouseLeave = () => this.#setAnchor(null);

	#unfreezeAnchor = () => {
		if (this.#nextAnchor === null) {
			// console.log("unfreeze: clearing anchor");
			this.#anchor = { element: null, position: 0 };
		} else if (this.#nextAnchor !== undefined) {
			const element = this.#nextAnchor;
			const { top: position = 0 } = element?.getBoundingClientRect() ?? {};
			// console.log("unfreeze: anchoring", element, "to", position);
			this.#anchor = { element, position };
		}
		this.#nextAnchor = undefined;
		this.#anchorFreeze = null;
	};

	#scrollPad = (delta = 0) => {
		const { scrollTop, scrollHeight } = this.#container;
		// If scrolled to the bottom, suppress scroll up.
		const atBottom = scrollTop + this.viewHeight > scrollHeight - 0.5;

		const contentStyle = this.#content.style;
		const contentAbove = this.viewTop + delta;
		const contentBelow = this.contentHeight - this.viewBottom - delta;

		this.#padTop = Math.max(0, -contentAbove);
		this.#padBottom = Math.max(0, -contentBelow);
		const nextScrollTop = contentAbove + this.#padTop;

		contentStyle.paddingTop = `${this.#padTop}px`;
		contentStyle.paddingBottom = `${this.#padBottom}px`;
		if (
			(!atBottom || delta >= 0 || this.#lastScrollDelta <= 0) &&
			Math.abs(scrollTop - nextScrollTop) > 0.5
		) {
			this.#isMutationScroll = true;
			this.#container.scrollTop = nextScrollTop;
		}

		// Freeze the effective anchor for 50ms after any resize
		if (this.#anchorFreeze) clearTimeout(this.#anchorFreeze);
		this.#anchorFreeze = setTimeout(this.#unfreezeAnchor, 50);
	};
}

customElements.define("scroll-pane", ScrollPane);
