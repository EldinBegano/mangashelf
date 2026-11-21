import { mount } from 'svelte';
import '@/assets/app.css';
import History from './History.svelte';

mount(History, { target: document.getElementById('app')! });
