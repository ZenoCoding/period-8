import './style.css';
import { createRepetitionGame } from './render/app/createRepetitionGame';

const root = document.querySelector<HTMLDivElement>('#app');

if (!root) {
  throw new Error('Missing #app root element.');
}

createRepetitionGame(root);
