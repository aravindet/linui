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
	#nextAnchor = null;
	#anchorFreeze = null;

	#isProgrammaticScroll = false;

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
	}

	#getContentTop = (el) => {
		const containerTop = this.#container.getBoundingClientRect().top;
		const { top } = el.getBoundingClientRect();
		const { scrollTop } = this.#container;
		const padTop = parseFloat(this.#content.style.paddingTop) || 0;
		return top - containerTop + scrollTop - padTop;
	};

	#onIntersection = (entries) => {
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

	#onResize = () => {
		if (this.#anchor.element?.isConnected) {
			const currentTop = this.#getContentTop(this.#anchor.element);
			const delta = currentTop - this.#anchor.position;
			this.#anchor.position = currentTop;
			if (delta) this.#scrollPad(delta);
			return;
		}

		const deltaStats = [];
		let modalBucket = null;
		for (const [el, storedTop] of this.#visibleChildren) {
			const currentTop = this.#getContentTop(el);
			const delta = currentTop - storedTop;
			const bucket = Math.round(delta);
			const [n = 0, sum = 0] = deltaStats[bucket] ?? [];
			deltaStats[bucket] = [n + 1, sum + delta];
			if (modalBucket == null || n + 1 > deltaStats[modalBucket][0]) {
				modalBucket = bucket;
			}
			this.#visibleChildren.set(el, currentTop);
		}

		if (modalBucket != null) {
			const [n, sum] = deltaStats[modalBucket];
			this.#scrollPad(sum / n);
		}
	};

	#onSlotChange = () => {
		const next = new Set(this.#slot.assignedElements());

		for (const el of this.#observedChildren) {
			if (next.has(el)) continue;
			this.#resizeObserver.unobserve(el);
			this.#intersectionObserver.unobserve(el);
			this.#visibleChildren.delete(el);
		}

		for (const el of next) {
			if (this.#observedChildren.has(el)) continue;
			this.#resizeObserver.observe(el, { box: "border-box" });
			this.#intersectionObserver.observe(el);
		}

		this.#observedChildren = next;
	};

	#setAnchor(element, override = false) {
		const position = element ? this.#getContentTop(element) : 0;
		if (this.#anchorFreeze && !override) {
			this.#nextAnchor = { element, position };
		} else {
			this.#anchor = { element, position };
		}
	}

	#onScroll = () => {
		if (this.#isProgrammaticScroll) return;
		this.#setAnchor(null, true);
	};

	#onMouseDown = (e) => this.#setAnchor(e.target, true);
	#onMouseMove = (e) => this.#setAnchor(e.target);
	#onMouseLeave = () => this.#setAnchor(null);

	get visibleChildren() {
		return this.#visibleChildren.keys();
	}

	#unfreezeAnchor = () => {
		if (this.#anchorFreeze && this.#nextAnchor != null) {
			this.#anchor = this.#nextAnchor;
			this.#nextAnchor = null;
		}
		this.#anchorFreeze = null;
	};

	#clearProgrammaticScroll = () => {
		this.#isProgrammaticScroll = false;
	};

	#scrollPad = (delta = 0) => {
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
		this.#isProgrammaticScroll = true;
		this.#container.scrollTop = scrollTop;
		requestAnimationFrame(this.#clearProgrammaticScroll);

		// Freeze the effective anchor for 50s after any resize
		if (this.#anchorFreeze) clearTimeout(this.#anchorFreeze);
		this.#anchorFreeze = setTimeout(this.#unfreezeAnchor, 50);
	};
}

customElements.define("scroll-pane", ScrollPane);
