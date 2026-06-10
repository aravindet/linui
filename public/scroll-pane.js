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
	#anchorElement = null;
	#anchorY = 0;
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
		this.addEventListener("mouseenter", this.#onAnchorUpdate);
		this.addEventListener("mousemove", this.#onAnchorUpdate);
		this.addEventListener("mouseleave", this.#onMouseLeave);
		this.#slot.addEventListener("slotchange", this.#onSlotChange);
	}

	disconnectedCallback() {
		this.removeEventListener("mouseenter", this.#onAnchorUpdate);
		this.removeEventListener("mousemove", this.#onAnchorUpdate);
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
		console.log("Intersection observer called");
		let change = false;
		for (const { target, isIntersecting } of entries) {
			if (isIntersecting) {
				// if (this.#visibleChildren.has(target)) {
				// 	console.log(
				// 		"visibility updated: top moves from",
				// 		target,
				// 		this.#visibleChildren.get(target),
				// 		this.#getContentTop(target),
				// 	);
				// }
				this.#visibleChildren.set(target, this.#getContentTop(target));
				change = true;
			} else if (this.#visibleChildren.has(target)) {
				this.#visibleChildren.delete(target);
				change = true;
			}
		}
		if (change) this.dispatchEvent(new Event("visibleChildrenChange"));
	};

	#onResize = (entries) => {
		console.log("Resize observer called");
		if (this.#anchorElement?.isConnected) {
			console.log("anchor element");
			const currentTop = this.#getContentTop(this.#anchorElement);
			const delta = currentTop - this.#anchorY;
			this.#anchorY = currentTop;
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
		console.log("slot change called");
		this.#resizeObserver.disconnect();
		this.#intersectionObserver.disconnect();

		for (const el of this.#slot.assignedElements()) {
			this.#resizeObserver.observe(el, { box: "border-box" });
			this.#intersectionObserver.observe(el);
		}
	};

	#onAnchorUpdate = (e) => {
		this.#anchorElement = e.target;
		this.#anchorY = this.#getContentTop(e.target);
	};

	#onMouseLeave = () => {
		this.#anchorElement = null;
	};

	get visibleChildren() {
		return this.#visibleChildren.keys();
	}

	get viewTop() {
		const padTop = parseFloat(this.#content.style.paddingTop) || 0;
		return this.#container.scrollTop - padTop;
	}

	get viewBottom() {
		return this.viewTop + this.viewHeight;
	}

	get viewHeight() {
		return this.#container.clientHeight;
	}

	get contentHeight() {
		const contentStyle = this.#content.style;
		const padTop = parseFloat(contentStyle.paddingTop) || 0;
		const padBottom = parseFloat(contentStyle.paddingBottom) || 0;
		return this.#container.scrollHeight - padTop - padBottom;
	}

	#scrollPad = (delta = 0) => {
		console.log("scroll pad called", delta);
		const contentAbove = this.viewTop + delta;
		const contentBelow = this.contentHeight - this.viewBottom - delta;

		const padTop = Math.max(0, -contentAbove);
		const padBottom = Math.max(0, -contentBelow);
		const scrollTop = contentAbove + padTop;

		const contentStyle = this.#content.style;
		contentStyle.paddingTop = `${padTop}px`;
		contentStyle.paddingBottom = `${padBottom}px`;
		this.#container.scrollTop = scrollTop;
	};
}

customElements.define("scroll-pane", ScrollPane);
