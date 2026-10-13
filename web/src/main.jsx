import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import VolumeLab from './VolumeLab.jsx';
import './styles.css';

// /?lab=volume opent de proefpagina met volume-ontwerpen (nagebootste spelers).
const lab = new URLSearchParams(window.location.search).get('lab');
createRoot(document.getElementById('root')).render(lab === 'volume' ? <VolumeLab /> : <App />);
