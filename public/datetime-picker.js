const html = String.raw;
const css = String.raw;

import "./scroll-pane.js";

const MONTHS = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const style = css`
	:host {
		display: block;
		width: 240px;
		height: 240px;
		background: #1e1e2e;
		color: #cdd6f4;
		font-family: system-ui, sans-serif;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
		interpolate-size: allow-keywords;
	}

	scroll-pane {
		width: 100%;
		height: 100%;
	}

	summary {
		list-style: none;
	}

	summary::-webkit-details-marker {
		display: none;
	}

	details > summary {
		height: 40px;
		display: flex;
		align-items: center;
		padding: 0 16px;
		font-size: 13px;
		font-weight: 600;
		color: #cdd6f4;
		background: #11111b;
		cursor: pointer;
		user-select: none;
	}

	details > summary:hover {
		background: #313244;
	}

	details[open] > summary {
		position: sticky;
		top: 0;
		z-index: 1;
		color: #cba6f7;
	}

	details details > summary {
		padding-left: 16px;
		font-weight: 500;
		background: #181825;
	}

	details details[open] > summary {
		top: 0;
		z-index: 2;
	}

	details details details > summary {
		padding-left: calc(16px + 5ch);
		font-weight: 400;
		background: #1e1e2e;
	}

	details details details[open] > summary {
		top: 0;
		z-index: 3;
		background: none;
	}

	details details details[open] {
		scroll-snap-stop: always;
		scroll-snap-align: start;
	}


	.cal-month {
		padding: 4px 8px 8px;
	}

	.cal-header {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		margin-bottom: 2px;
		position: sticky;
		top: 40px;
		background: #1e1e2e;
		z-index: 2;
	}

	.cal-header > span {
		height: 26px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 600;
		color: #585b70;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
	}

	.day {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		border-radius: 50%;
		font-size: 12px;
		cursor: pointer;
		user-select: none;
	}

	.day:hover {
		background: #313244;
	}

	.day[data-today] {
		color: #cba6f7;
	}

	.day[data-selected] {
		background: #45475a;
		color: #cba6f7;
	}

	.day[data-disabled] {
		opacity: 0.3;
		pointer-events: none;
	}

	details::details-content {
		overflow: clip;
		height: 0;
		transition:
			height 200ms ease,
			content-visibility 200ms allow-discrete;
	}

	details[open]::details-content {
		height: auto;
	}

	:host([data-instant]) details::details-content {
		transition: none;
	}
`;

const template = document.createElement("template");
template.innerHTML = html`
	<style>${style}</style>
	<scroll-pane></scroll-pane>
`;

class DatetimePicker extends HTMLElement {
	static observedAttributes = ["min", "max", "value"];

	#year;
	#month;
	#date;
	#minDate = null;
	#maxDate = null;
	#pane;
	#initialized = false;

	constructor() {
		super();
		const now = new Date();
		this.#year = now.getFullYear();
		this.#month = now.getMonth();
		this.#date = now.getDate();

		this.attachShadow({ mode: "open" });
		this.shadowRoot.appendChild(template.content.cloneNode(true));
		this.#pane = this.shadowRoot.querySelector("scroll-pane");
	}

	connectedCallback() {
		this.#render();
		this.shadowRoot.addEventListener("click", this.#onClick);
	}

	disconnectedCallback() {
		this.shadowRoot.removeEventListener("click", this.#onClick);
	}

	attributeChangedCallback(name, _, value) {
		if (name === "min") this.#minDate = value ? this.#parseDate(value) : null;
		else if (name === "max")
			this.#maxDate = value ? this.#parseDate(value) : null;
		else if (name === "value") {
			const d = this.#parseDate(value);
			if (d) {
				this.#year = d.getFullYear();
				this.#month = d.getMonth();
				this.#date = d.getDate();
			}
		}
		if (this.isConnected) this.#render();
	}

	get value() {
		const y = String(this.#year).padStart(4, "0");
		const m = String(this.#month + 1).padStart(2, "0");
		const d = String(this.#date).padStart(2, "0");
		return `${y}-${m}-${d}`;
	}

	#parseDate(str) {
		const [y, m, d] = str.split("-").map(Number);
		return y && m && d ? new Date(y, m - 1, d) : null;
	}

	#render() {
		const decadeStart = Math.floor(this.#year / 10) * 10;
		this.setAttribute("data-instant", "");
		const decades = [];
		for (let d = decadeStart - 50; d <= decadeStart + 10; d += 10) {
			decades.push(this.#renderDecade(d));
		}
		this.#pane.replaceChildren(...decades);
		requestAnimationFrame(() => this.removeAttribute("data-instant"));
		const behavior = this.#initialized ? "smooth" : "instant";
		this.#initialized = true;
		setTimeout(() => this.#scrollToMonth(behavior), 100);
	}

	#scrollToMonth(behavior = "smooth") {
		this.#pane
			.querySelector(`[data-year="${this.#year}"][data-month="${this.#month}"]`)
			?.scrollIntoView({ behavior, block: "start" });
	}

	#renderDecade(decadeStart) {
		const el = document.createElement("details");
		el.name = "decades";
		el.open = this.#year >= decadeStart && this.#year < decadeStart + 10;

		const summary = document.createElement("summary");
		summary.textContent = `${decadeStart} — ${decadeStart + 10}`;
		el.appendChild(summary);

		for (let y = decadeStart; y <= decadeStart + 9; y++) {
			el.appendChild(this.#renderYear(y));
		}

		return el;
	}

	#renderYear(year) {
		const el = document.createElement("details");
		el.dataset.year = year;
		el.name = `decade-${Math.floor(year / 10) * 10}`;
		el.open = year === this.#year;

		const summary = document.createElement("summary");
		summary.textContent = String(year);
		el.appendChild(summary);

		for (let m = 0; m < 12; m++) {
			el.appendChild(this.#renderMonth(year, m));
		}

		return el;
	}

	#renderMonth(year, month) {
		const el = document.createElement("details");
		el.dataset.year = year;
		el.dataset.month = month;
		el.name = `year-${year}`;
		el.open = year === this.#year && month === this.#month;

		const summary = document.createElement("summary");
		summary.textContent = MONTHS[month];
		el.appendChild(summary);

		el.appendChild(this.#renderCalendar(year, month));
		return el;
	}

	#renderCalendar(year, month) {
		const today = new Date();
		const firstDay = new Date(year, month, 1).getDay();
		const daysInMonth = new Date(year, month + 1, 0).getDate();

		const header = document.createElement("div");
		header.className = "cal-header";
		for (const label of WEEKDAYS) {
			const span = document.createElement("span");
			span.textContent = label;
			header.appendChild(span);
		}

		const grid = document.createElement("div");
		grid.className = "cal-grid";

		for (let i = 0; i < firstDay; i++) {
			grid.appendChild(document.createElement("div"));
		}

		for (let d = 1; d <= daysInMonth; d++) {
			const cell = document.createElement("div");
			cell.className = "day";
			cell.textContent = String(d);
			cell.dataset.year = year;
			cell.dataset.month = month;
			cell.dataset.day = d;
			if (
				year === today.getFullYear() &&
				month === today.getMonth() &&
				d === today.getDate()
			) {
				cell.dataset.today = "";
			}
			if (year === this.#year && month === this.#month && d === this.#date) {
				cell.dataset.selected = "";
			}
			if (this.#dayDisabled(year, month, d)) {
				cell.dataset.disabled = "";
			}
			grid.appendChild(cell);
		}

		const wrap = document.createElement("div");
		wrap.className = "cal-month";
		wrap.appendChild(header);
		wrap.appendChild(grid);
		return wrap;
	}

	#dayDisabled(year, month, day) {
		const date = new Date(year, month, day);
		return (
			(this.#minDate !== null && date < this.#minDate) ||
			(this.#maxDate !== null && date > this.#maxDate)
		);
	}

	#onClick = (e) => {
		const path = e.composedPath();

		const day = path.find(
			(el) => el instanceof HTMLElement && el.dataset.day != null,
		);
		if (day) {
			if ("disabled" in day.dataset) return;
			this.#year = +day.dataset.year;
			this.#month = +day.dataset.month;
			this.#date = +day.dataset.day;
			this.#render();
			this.dispatchEvent(new Event("change", { bubbles: true }));
			return;
		}

		const monthSummary = path.find(
			(el) =>
				el instanceof HTMLElement &&
				el.tagName === "SUMMARY" &&
				el.parentElement?.dataset.month != null,
		);
		if (monthSummary && !monthSummary.parentElement.open) {
			setTimeout(
				() =>
					monthSummary.parentElement.scrollIntoView({
						behavior: "smooth",
						block: "start",
					}),
				100,
			);
		}
	};
}

customElements.define("datetime-picker", DatetimePicker);
