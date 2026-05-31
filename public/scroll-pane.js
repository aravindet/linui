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
	#anchorEl = null;
	#anchorY = 0;
	#rafId = null;
	#loopUntil = 0;
	#hovered = false;

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
		this.shadowRoot.appendChild(template.content.cloneNode(true));
		this.#container = this.shadowRoot.querySelector(".scroll-container");
		this.#content = this.shadowRoot.querySelector(".scroll-content");
	}

	connectedCallback() {
		this.addEventListener("click", this.#onClick);
		this.addEventListener("mouseenter", this.#onMouseEnter);
		this.addEventListener("mouseleave", this.#onMouseLeave);
		this.#container.addEventListener("scroll", this.#onScroll);
	}

	disconnectedCallback() {
		this.removeEventListener("click", this.#onClick);
		this.removeEventListener("mouseenter", this.#onMouseEnter);
		this.removeEventListener("mouseleave", this.#onMouseLeave);
		this.#container.removeEventListener("scroll", this.#onScroll);
	}

	#onScroll = () => {
		if (this.#hovered) this.#scrollPad(0);
	};

	#onMouseEnter = () => {
		this.#hovered = true;
		const { paddingTop, paddingBottom } = getComputedStyle(this.#content);
		console.log("restoring", { paddingTop, paddingBottom });
		const contentStyle = this.#content.style;
		contentStyle.transition = "none";
		contentStyle.paddingTop = paddingTop;
		contentStyle.paddingBottom = paddingBottom;
	};

	#onMouseLeave = () => {
		this.#hovered = false;
		const contentStyle = this.#content.style;
		contentStyle.transition = "padding 5s ease-in-out";
		contentStyle.paddingTop = 0;
		contentStyle.paddingBottom = 0;
	};

	#scrollPad = (delta = 0) => {
		// Get current values from the DOM.
		const contentStyle = this.#content.style;
		const { scrollTop, scrollHeight, clientHeight } = this.#container;
		const padTop = parseFloat(contentStyle.paddingTop) || 0;
		const padBottom = parseFloat(contentStyle.paddingBottom) || 0;

		// Real coords, i.e. relative to actual content excluding paddings.
		const realHeight = scrollHeight - padTop - padBottom;
		const realScrollTop = scrollTop - padTop + delta;
		const realScrollBottom = realScrollTop + clientHeight - realHeight;

		// Calculate optimal DOM values
		const nextPadTop = Math.max(0, -realScrollTop);
		const nextPadBottom = Math.max(0, realScrollBottom);
		const nextScrollTop = realScrollTop + nextPadTop;

		// Put the optimal values into the DOM
		contentStyle.paddingTop = `${nextPadTop}px`;
		contentStyle.paddingBottom = `${nextPadBottom}px`;
		this.#container.scrollTop = nextScrollTop;
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
		if (delta) {
			this.#scrollPad(delta);
			this.#loopUntil = performance.now() + 100;
		}

		if (performance.now() < this.#loopUntil && !this.#rafId) {
			this.#rafId = requestAnimationFrame(this.#loop);
		}
	};
}

customElements.define("scroll-pane", ScrollPane);
