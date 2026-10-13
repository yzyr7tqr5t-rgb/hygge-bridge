import { useState } from 'react';

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Zonder https is het klembord vaak geblokkeerd: val terug op een tijdelijk tekstveld.
    const el = document.createElement('textarea');
    el.value = text;
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand?.('copy') ?? false;
    el.remove();
    return ok;
  }
}

export default function Share({ status, version }) {
  const url = window.location.origin;
  const [copied, setCopied] = useState(null);
  const [failed, setFailed] = useState(false);

  const onCopy = async () => {
    const ok = await copy(url);
    setCopied(ok);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <main className="share">
      <header>
        <div>
          <h1>Delen</h1>
          <p className="avg">Open de app op een ander toestel</p>
        </div>
        <span className={`pill ${status[0]}`}><i />{status[1]}</span>
      </header>

      <section className="card qr-card">
        <div className="qr-box">
          {failed ? <p className="hint">QR-code kon niet geladen worden.</p> : <img src="/api/qr" alt={`QR-code voor ${url}`} onError={() => setFailed(true)} />}
        </div>
        <p className="qr-url">{url.replace(/^https?:\/\//, '')}</p>
        <button className="qr-copy" onClick={onCopy}>
          {copied === true ? 'Gekopieerd ✓' : copied === false ? 'Kopiëren lukt niet, selecteer het adres' : 'Adres kopiëren'}
        </button>
      </section>

      <section className="card steps">
        <h2>Zo zet je de app op je iPhone</h2>
        <ol>
          <li>Open de camera en richt hem op de QR-code. Tik op het adres dat verschijnt.</li>
          <li>Tik in Safari op <b>Delen</b> (het vierkantje met pijl).</li>
          <li>Kies <b>Zet op beginscherm</b> en tik op <b>Voeg toe</b>.</li>
        </ol>
        <p className="footnote">Het toestel moet op hetzelfde wifi-netwerk zitten.</p>
      </section>
      {version && <p className="footnote">Hygge-app versie {version}</p>}
    </main>
  );
}
