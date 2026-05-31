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

const style = css`
	:host {
		display: inline-flex;
		background: #1e1e2e;
		color: #cdd6f4;
		font-family: system-ui, sans-serif;
		border-radius: 8px;
		overflow: hidden;
		box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
	}

	scroll-pane {
		height: 280px;
	}

	#pane-year { width: 80px; }
	#pane-month { width: 130px; }
	#pane-cal { width: 268px; }
	#pane-hour { width: 68px; }
	#pane-minute { width: 68px; }

	.sep {
		width: 1px;
		background: #313244;
		align-self: stretch;
	}

	.weekdays {
		display: grid;
		grid-template-columns: repeat(7, 36px);
		padding: 0 4px;
		position: sticky;
		top: 0;
		background: #181825;
		z-index: 1;
	}

	.weekdays > span {
		height: 28px;
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 11px;
		font-weight: 600;
		color: #585b70;
	}

	.item {
		height: 40px;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 16px;
		font-size: 13px;
		cursor: pointer;
		user-select: none;
		white-space: nowrap;
	}

	.item:hover {
		background: #313244;
	}

	.item[data-selected] {
		background: #45475a;
		color: #cba6f7;
	}

	.item[data-disabled] {
		opacity: 0.3;
		pointer-events: none;
	}

	.cal-grid {
		display: grid;
		grid-template-columns: repeat(7, 36px);
		padding: 2px 4px;
	}

	.cal-grid .item {
		width: 36px;
		height: 36px;
		padding: 0;
		border-radius: 50%;
		font-size: 12px;
	}
`;

const template = document.createElement("template");
template.innerHTML = html`
	<style>${style}</style>
	<scroll-pane id="pane-year"></scroll-pane>
	<div class="sep"></div>
	<scroll-pane id="pane-month"></scroll-pane>
	<div class="sep"></div>
	<scroll-pane id="pane-cal"></scroll-pane>
	<div class="sep"></div>
	<scroll-pane id="pane-hour"></scroll-pane>
	<div class="sep"></div>
	<scroll-pane id="pane-minute"></scroll-pane>
`;

class DatetimePicker extends HTMLElement {
	static observedAttributes = ["min", "max", "step", "value"];

	#year;
	#month;
	#date;
	#hour;
	#minute;
	#minDate = null;
	#maxDate = null;
	#step = 60;
	#panes = {};
	#weekdays;

	constructor() {
		super();
		const now = new Date();
		this.#year = now.getFullYear();
		this.#month = now.getMonth();
		this.#date = now.getDate();
		this.#hour = now.getHours();
		this.#minute = now.getMinutes();

		this.attachShadow({ mode: "open" });
		this.shadowRoot.appendChild(template.content.cloneNode(true));

		for (const col of ["year", "month", "cal", "hour", "minute"]) {
			this.#panes[col] = this.shadowRoot.getElementById(`pane-${col}`);
		}

		this.#weekdays = document.createElement("div");
		this.#weekdays.className = "weekdays";
		this.#weekdays.innerHTML =
			"<span>Su</span><span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span>";
	}

	connectedCallback() {
		this.#render();
		this.shadowRoot.addEventListener("click", this.#onClick);
	}

	disconnectedCallback() {
		this.shadowRoot.removeEventListener("click", this.#onClick);
	}

	attributeChangedCallback(name, _, value) {
		({
			min: () => (this.#minDate = value ? new Date(value) : null),
			max: () => (this.#maxDate = value ? new Date(value) : null),
			step: () => (this.#step = Number(value) || 60),
			value: () => {
				const d = new Date(value);
				if (Number.isNaN(d)) return;
				this.#year = d.getFullYear();
				this.#month = d.getMonth();
				this.#date = d.getDate();
				this.#hour = d.getHours();
				this.#minute = d.getMinutes();
			},
		})[name]?.();
		if (this.isConnected) this.#render();
	}

	get value() {
		return new Date(
			this.#year,
			this.#month,
			this.#date,
			this.#hour,
			this.#minute,
		).toISOString();
	}

	#render() {
		this.#renderYears();
		this.#renderMonths();
		this.#renderCalendar();
		this.#renderHours();
		this.#renderMinutes();
	}

	#renderYears() {
		const min = this.#minDate?.getFullYear() ?? this.#year - 50;
		const max = this.#maxDate?.getFullYear() ?? this.#year + 50;
		this.#panes.year.replaceChildren(
			...Array.from({ length: max - min + 1 }, (_, i) => {
				const y = min + i;
				return this.#item(String(y), "year", y, y === this.#year, false);
			}),
		);
	}

	#renderMonths() {
		this.#panes.month.replaceChildren(
			...MONTHS.map((name, m) =>
				this.#item(name, "month", m, m === this.#month, this.#monthDisabled(m)),
			),
		);
	}

	#renderCalendar() {
		const firstDay = new Date(this.#year, this.#month, 1).getDay();
		const lastDate = new Date(this.#year, this.#month + 1, 0).getDate();

		const blanks = Array.from({ length: firstDay }, () =>
			Object.assign(document.createElement("div"), { className: "item" }),
		);
		const dates = Array.from({ length: lastDate }, (_, i) => {
			const d = i + 1;
			return this.#item(
				String(d),
				"date",
				d,
				d === this.#date,
				this.#dateDisabled(d),
			);
		});

		const grid = document.createElement("div");
		grid.className = "cal-grid";
		grid.replaceChildren(...blanks, ...dates);
		this.#panes.cal.replaceChildren(this.#weekdays, grid);
	}

	#renderHours() {
		const step = Math.max(1, Math.floor(this.#step / 3600));
		this.#panes.hour.replaceChildren(
			...Array.from({ length: Math.ceil(24 / step) }, (_, i) => {
				const h = i * step;
				return this.#item(
					String(h).padStart(2, "0"),
					"hour",
					h,
					h === this.#hour,
					false,
				);
			}),
		);
	}

	#renderMinutes() {
		const step = Math.max(1, Math.round(this.#step / 60));
		const count = Math.min(60, Math.ceil(60 / step));
		this.#panes.minute.replaceChildren(
			...Array.from({ length: count }, (_, i) => {
				const m = (i * step) % 60;
				return this.#item(
					String(m).padStart(2, "0"),
					"minute",
					m,
					m === this.#minute,
					false,
				);
			}),
		);
	}

	#item(label, col, val, selected, disabled) {
		const el = document.createElement("div");
		el.className = "item";
		el.textContent = label;
		el.dataset.col = col;
		el.dataset.val = val;
		if (selected) el.dataset.selected = "";
		if (disabled) el.dataset.disabled = "";
		return el;
	}

	#onClick = (e) => {
		const item = e.composedPath().find((el) => el.dataset?.col);
		if (!item || "disabled" in item.dataset) return;

		({
			year: () => (this.#year = +item.dataset.val),
			month: () => (this.#month = +item.dataset.val),
			date: () => (this.#date = +item.dataset.val),
			hour: () => (this.#hour = +item.dataset.val),
			minute: () => (this.#minute = +item.dataset.val),
		})[item.dataset.col]?.();

		this.#date = Math.min(
			this.#date,
			new Date(this.#year, this.#month + 1, 0).getDate(),
		);
		this.#render();
		this.dispatchEvent(new Event("change", { bubbles: true }));
	};

	#monthDisabled(m) {
		const first = new Date(this.#year, m, 1);
		const last = new Date(this.#year, m + 1, 0);
		return (
			(this.#minDate != null && last < this.#minDate) ||
			(this.#maxDate != null && first > this.#maxDate)
		);
	}

	#dateDisabled(d) {
		const date = new Date(this.#year, this.#month, d);
		return (
			(this.#minDate != null && date < this.#minDate) ||
			(this.#maxDate != null && date > this.#maxDate)
		);
	}
}

customElements.define("datetime-picker", DatetimePicker);
