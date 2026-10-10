import './app.css';
import { mount } from 'svelte';
import App from './App.svelte';

const target = document.getElementById('app');

if (!target) {
  throw new Error('Não foi encontrado o elemento raiz #app.');
}

export const app = mount(App, { target });
