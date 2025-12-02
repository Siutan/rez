import { mount } from 'svelte';
import './style.css';
import DraftPreview from './lib/draft/DraftPreview.svelte';

const app = mount(DraftPreview, {
  target: document.getElementById('app')!,
});

export default app;


