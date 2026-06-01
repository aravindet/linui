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
	#keyPositions = new Map();
	#anchorEl = null;
	#anchorY = 0;
	#rafId = null;
	#loopUntil = 0;
	#hovered = false;

	#resizeObserver = null;

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.appendChild(template.content.cloneNode(true));
		this.#container = this.shadowRoot.querySelector(".scroll-container");
		this.#content = this.shadowRoot.querySelector(".scroll-content");
		this.#slot = this.shadowRoot.querySelector("slot");
		this.#resizeObserver = new ResizeObserver(this.#onResize);
	}

	connectedCallback() {
		this.addEventListener("click", this.#onClick);
		this.addEventListener("mouseenter", this.#onMouseEnter);
		this.addEventListener("mouseleave", this.#onMouseLeave);
		this.#container.addEventListener("scroll", this.#onScroll);
		this.#slot.addEventListener("slotchange", this.#onSlotChange);
	}

	disconnectedCallback() {
		this.removeEventListener("click", this.#onClick);
		this.removeEventListener("mouseenter", this.#onMouseEnter);
		this.removeEventListener("mouseleave", this.#onMouseLeave);
		this.#container.removeEventListener("scroll", this.#onScroll);
		this.#slot.removeEventListener("slotchange", this.#onSlotChange);
	}

	#onResize = () => {
		console.log("ResizeObserver");
		const elements = this.#slot.assignedElements();

		const containerTop = this.#container.getBoundingClientRect().top;
		const { scrollTop } = this.#container;
		const padTop = parseFloat(this.#content.style.paddingTop) || 0;
		const offset = scrollTop - padTop - containerTop;
		const newPositions = new Map();

		for (const el of elements) {
			const key = el.dataset?.key;
			if (key == null) continue;
			let { top, bottom } = el.getBoundingClientRect();
			top += offset;
			bottom += offset;
			newPositions.set(key, { top, bottom });
		}
		this.#keyPositions = newPositions;
	};

	#onSlotChange = () => {
		console.log("slot change");
		const elements = this.#slot.assignedElements();
		this.#resizeObserver.disconnect();

		const containerTop = this.#container.getBoundingClientRect().top;
		const { scrollTop } = this.#container;
		const padTop = parseFloat(this.#content.style.paddingTop) || 0;
		const offset = scrollTop - padTop - containerTop;

		const newPositions = new Map();
		let totalDelta = 0;
		let matchCount = 0;

		for (const el of elements) {
			this.#resizeObserver.observe(el);
			const key = el.dataset?.key;
			if (key == null) continue;
			let { top, bottom } = el.getBoundingClientRect();
			top += offset;
			bottom += offset;
			newPositions.set(key, { top, bottom });

			const oldItemBounds = this.#keyPositions.get(key);
			if (!oldItemBounds) continue;
			const { top: oldTop, bottom: oldBottom } = oldItemBounds;
			if (oldBottom < this.viewTop || oldTop > this.viewBottom) continue;

			totalDelta += top - oldItemBounds.top;
			matchCount += 1;
		}

		if (matchCount) this.#scrollPad(totalDelta / matchCount);
		this.#keyPositions = newPositions;
	};

	#onScroll = () => {
		if (this.#hovered) {
			this.#scrollPad(0);
		} else {
			this.dispatchEvent(new Event("scroll"));
		}
	};

	#onMouseEnter = () => {
		this.#hovered = true;
		const { paddingTop, paddingBottom } = getComputedStyle(this.#content);
		const contentStyle = this.#content.style;
		contentStyle.transition = "none";
		contentStyle.paddingTop = paddingTop;
		contentStyle.paddingBottom = paddingBottom;
	};

	#onMouseLeave = () => {
		this.#hovered = false;
		const contentStyle = this.#content.style;
		contentStyle.transition = "padding 0.5s ease-in-out";
		contentStyle.paddingTop = 0;
		contentStyle.paddingBottom = 0;
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

		// Calculate DOM values
		const padTop = Math.max(0, -contentAbove);
		const padBottom = Math.max(0, -contentBelow);
		const scrollTop = contentAbove + padTop;

		const contentStyle = this.#content.style;
		contentStyle.paddingTop = `${padTop}px`;
		contentStyle.paddingBottom = `${padBottom}px`;
		this.#container.scrollTop = scrollTop;

		this.dispatchEvent(new Event("scroll"));
	};

	#onClick = (e) => {
		if (this.#rafId !== null) cancelAnimationFrame(this.#rafId);
		this.#anchorEl = e.target;
		this.#anchorY = e.target.getBoundingClientRect().top;
		this.#loopUntil = performance.now() + 100;
		this.#rafId = requestAnimationFrame(this.#loop);
	};

	#loop = () => {
		this.#rafId = null;
		if (!this.#anchorEl.isConnected) return;
		const delta = this.#anchorEl.getBoundingClientRect().top - this.#anchorY;
		this.#scrollPad(delta);
		if (delta) this.#loopUntil = performance.now() + 100;
		if (performance.now() < this.#loopUntil) {
			this.#rafId = requestAnimationFrame(this.#loop);
		}
	};
}

customElements.define("scroll-pane", ScrollPane);
