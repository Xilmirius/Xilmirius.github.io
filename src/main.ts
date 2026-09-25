import './ui/styles.css';
import { App } from './app';
import { ensureUniqueTabId } from './config';

ensureUniqueTabId();

const root = document.getElementById('app')!;
const app = new App(root);
app.start();
(window as any).__rubble = app;
