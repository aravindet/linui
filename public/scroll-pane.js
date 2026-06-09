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
		this.#container.addEventListener("scroll", this.#onScroll);
		this.#slot.addEventListener("slotchange", this.#onSlotChange);
	}

	disconnectedCallback() {
		this.removeEventListener("mouseenter", this.#onAnchorUpdate);
		this.removeEventListener("mousemove", this.#onAnchorUpdate);
		this.removeEventListener("mouseleave", this.#onMouseLeave);
		this.#container.removeEventListener("scroll", this.#onScroll);
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
		for (const { target, isIntersecting } of entries) {
			if (isIntersecting) {
				this.#visibleChildren.set(target, this.#getContentTop(target));
			} else {
				this.#visibleChildren.delete(target);
			}
		}
	};

	#onResize = () => {
		if (this.#anchorElement?.isConnected) {
			const currentTop = this.#getContentTop(this.#anchorElement);
			const delta = currentTop - this.#anchorY;
			this.#anchorY = currentTop;
			if (delta) {
				this.#scrollPad(delta);
			}
			return;
		}

		let totalDelta = 0;
		let count = 0;
		for (const [el, storedTop] of this.#visibleChildren) {
			const delta = this.#getContentTop(el) - storedTop;
			if (delta) {
				totalDelta += delta;
				count++;
			}
		}
		if (count) {
			this.#scrollPad(totalDelta / count);
			for (const [el] of this.#visibleChildren) {
				this.#visibleChildren.set(el, this.#getContentTop(el));
			}
		}
	};

	#onSlotChange = () => {
		this.#resizeObserver.disconnect();
		this.#intersectionObserver.disconnect();

		let totalDelta = 0;
		let count = 0;

		for (const el of this.#slot.assignedElements()) {
			this.#resizeObserver.observe(el, { box: "border-box" });
			this.#intersectionObserver.observe(el);

			if (!this.#visibleChildren.has(el)) continue;
			const delta = this.#getContentTop(el) - this.#visibleChildren.get(el);
			totalDelta += delta;
			count++;
		}

		if (count) this.#scrollPad(totalDelta / count);

		for (const [el] of this.#visibleChildren) {
			if (el.isConnected) {
				this.#visibleChildren.set(el, this.#getContentTop(el));
			} else {
				this.#visibleChildren.delete(el);
			}
		}
		if (this.#anchorElement?.isConnected) {
			this.#anchorY = this.#getContentTop(this.#anchorElement);
		}
	};

	#onScroll = () => {
		this.dispatchEvent(new Event("scroll"));
	};

	#onAnchorUpdate = (e) => {
		this.#anchorElement = e.target;
		this.#anchorY = this.#getContentTop(e.target);
	};

	#onMouseLeave = () => {
		this.#anchorElement = null;
	};

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
