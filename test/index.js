import { properties }  from '@aegisjsproject/styles/properties.js';
import { baseTheme, darkTheme, lightTheme } from '@aegisjsproject/styles/theme.js';
import { btn, btnPrimary, btnSuccess, btnDanger } from '@aegisjsproject/styles/button.js';
import { forms } from '@aegisjsproject/styles/forms.js';
import { statusBoxes, positions, floats, displays, fonts, utilities } from '@aegisjsproject/styles/misc.js';
import { deleteItem, addItem, openDB, getItem, putItem, getAllItems } from '@aegisjsproject/idb';
import { css } from '@aegisjsproject/parsers/css.js';

const STORE_NAME = 'list';

export const SCHEMAS = {
	todos: {
		name: 'todos',
		version: 4,
		stores: {
			list: {
				keyPath: 'id',
				autoIncrement: false,
				indexes: {
					name: { unique: 'true' },
				},
			},
			second: {
				autoIncrement: true,
			}
		},
	},
};

async function open(name, { signal = AbortSignal.timeout(100) } = {}) {
	return await openDB(SCHEMAS[name].name, { version: SCHEMAS[name].version, schema: SCHEMAS[name], signal });
}

async function render({ signal } = {}) {
	const db = await open('todos', { signal });

	try {
		const template = document.getElementById('todo-template');

		const tasks = await getAllItems(db, STORE_NAME).then(tasks => tasks.toSorted((a, b) => {
			if (a.due instanceof Date && ! (b.due instanceof Date)) {
				return -1;
			} else if (b.due instanceof Date && ! (a.due instanceof Date)) {
				return 1;
			} else if (b.due instanceof Date && a.due instanceof Date) {
				return Math.sign(a.due.getTime() - b.due.getTime());
			} else if (b.completed !== a.completed) {
				return b.completed ? -1 : 1;
			} else {
				return Math.sign(a.createdAt.getTime() - b.createdAt.getTime());
			}
		}));

		document.getElementById('todo-list').append(...tasks.map(todo => createTodo(todo, template)));
	} catch(err) {
		handleError(err);
	} finally {
		db.close();
	}
}

async function handleError(err) {
	const el = document.createElement('div');
	const controller = new AbortController();
	const { resolve, promise } = Promise.withResolvers();
	el.popover = 'auto';
	el.classList.add('status-box', 'error');
	el.textContent = `[${err.name}] "${err.message}"`;
	document.body.append(el);
	el.showPopover();

	el.addEventListener('toggle', ({ target, newState }) => {
		if (newState === 'closed') {
			target.remove();
			controller.abort();
			resolve();
		}
	}, { signal: controller.signal });

	return promise;
}

function createTodo(
	{ id, title, description, completed, createdAt, due, attachments = [] },
	template = document.getElementById('todo-template'),
) {
	const item = template.content.cloneNode(true);
	const listItem = item.querySelector('.todo-item');
	const checked = item.querySelector('[data-field="complete"]');

	checked.checked = completed;
	checked.dataset.taskId = id;

	item.querySelector('[data-field="title"]').textContent = title;
	item.querySelector('[data-field="description"]').textContent = description;
	item.querySelectorAll('[data-task-id]').forEach(el => el.dataset.taskId = id);
	item.querySelector('[data-field="createdAt"]').textContent = createdAt.toLocaleDateString(navigator.language, { dateStyle: 'medium' });

	listItem.id = id;
	listItem.dataset.createdAt = createdAt.toISOString();
	listItem.classList.toggle('task-completed', completed);

	if (due instanceof Date) {
		item.querySelector('[data-field="due"]').textContent = due.toLocaleDateString(navigator.language, { dateStyle: 'medium' });
	}

	item.querySelector('[data-field="attachments"]').append(...attachments.map(file => {
		const a = document.createElement('a');
		a.classList.add('btn', 'btn-primary');
		a.textContent = file.name;
		a.download = file.name;
		a.href = URL.createObjectURL(file);

		return a;
	}));

	return item;
}

document.adoptedStyleSheets = [
	properties, baseTheme, lightTheme, darkTheme, btn, btnPrimary, btnSuccess, btnDanger,
	forms, statusBoxes, positions, floats, displays, fonts, utilities,
	css`#todo-list {
		width: min(95vw, 600px);
		margin-inline: auto;
	}

	.todo-item {
		padding: 1.2em;
		border: 1px solid rgb(88, 88, 88);
		border-radius: 8px;
		margin-top: 0.2em;
		transition: opacity 400ms linear;

		&.task-completed {
			opacity: 0.4;
		}
	}

	.attachments-container:has([data-field="attachments"]:empty),
	.due-container:has([data-field="due"]:empty) {
		display: none;
	}

	[data-field="description"]:empty {
		display: none;
	}

	:popover-open {
		border: none;
		padding: 1.3em;
		border-radius: 8px;
		margin-top: auto;

		&::backdrop {
			background-color: rgba(0, 0, 0, 0.4);
			backdrop-filter: blur(4px);
		}
	}`,
];

document.getElementById('create-todo').addEventListener('submit', async event => {
	event.preventDefault();
	const db = await open('todos');

	try {
		const item = new FormData(event.target);
		const due = item.get('due');
		const task = {
			id: crypto.randomUUID(),
			createdAt: new Date(),
			due: typeof due === 'string' && due.length !== 0 ? new Date(due) : null,
			title: item.get('title'),
			description: item.get('description'),
			attachments: item.getAll('attachments').filter(file => file.name.length !== 0 && file.size !== 0),
			completed: false,
		};

		await addItem(db, STORE_NAME, task);
		document.getElementById('todo-list').append(createTodo(task));
		event.target.reset();
	} catch(err) {
		handleError(err);
	} finally {
		db.close();
	}
});

document.body.addEventListener('click', async ({ target }) => {
	const btn = target.closest('button');

	if (btn instanceof HTMLButtonElement && btn.dataset.hasOwnProperty('taskId')) {
		const container = target.closest('.todo-item');
		const db = await open('todos');

		try {
			await Promise.all([
				deleteItem(db, STORE_NAME, btn.dataset.taskId),
				container.animate([
					{ opacity: 1, transform: 'none' },
					{ opacity: 0, transform: 'scale(0)' },
				], {
					duration: 400,
					easing: 'ease-out',
				}).finished,
			]);

			container.remove();
		} catch(err) {
			handleError(err);
		} finally {
			db.close();
		}
	}
}, { passive: true });

document.body.addEventListener('change', async ({ target }) => {
	if (target.classList.contains('task-done') && target.dataset.hasOwnProperty('taskId')) {
		const db = await open('todos');

		try {
			const task = await getItem(db, STORE_NAME, target.dataset.taskId);
			task.completed = target.checked;
			target.closest('.todo-item').classList.toggle('task-completed', target.checked);
			await putItem(db, STORE_NAME, task);
		} catch(err) {
			handleError(err);
		} finally {
			db.close();
		}
	}
}, { passive: true });

document.getElementById('create-todo').addEventListener('reset', event =>  event.target.parentElement.hidePopover());

render();
