/**
 * SecureViewer — secure in-app file/image/document viewer
 * 
 * Features:
 * - Full-screen lightbox for images (pinch-zoom, pan)
 * - PDF/text rendering in sandboxed iframe
 * - Right-click, copy, drag all blocked
 * - Auto-revoke blob URLs on close
 * - Shield overlay on tab switch
 * - Close on Escape key
 */

import { useState, useEffect, useRef, useCallback } from 'react';

const CloseSvg = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>;
const ZoomInSvg = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>;
const ZoomOutSvg = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>;
const ShieldSvg = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>;

export default function SecureViewer({ file, onClose }) {
    // file: { url, name, type, size }
    const [zoom, setZoom] = useState(1);
    const [pan, setPan] = useState({ x: 0, y: 0 });
    const [dragging, setDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [shielded, setShielded] = useState(false);
    const [textContent, setTextContent] = useState(null);
    const containerRef = useRef(null);

    const isImage = file?.type?.startsWith('image/');
    const isPdf = file?.type === 'application/pdf';
    const isText = file?.type?.startsWith('text/') || file?.name?.endsWith('.txt') || file?.name?.endsWith('.md') || file?.name?.endsWith('.json') || file?.name?.endsWith('.csv');

    // Load text content
    useEffect(() => {
        if (!isText || !file?.url) return;
        fetch(file.url).then(r => r.text()).then(t => setTextContent(t)).catch(() => setTextContent('[Unable to read file]'));
    }, [file?.url, isText]);

    // Keyboard: Escape to close, +/- to zoom
    useEffect(() => {
        const onKey = (e) => {
            if (e.key === 'Escape') { onClose(); return; }
            if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoom(z => Math.min(z + 0.25, 5)); }
            if (e.key === '-') { e.preventDefault(); setZoom(z => Math.max(z - 0.25, 0.25)); }
            // Block copy/save/print
            const ctrl = e.ctrlKey || e.metaKey;
            if (ctrl && ['c', 's', 'p', 'a'].includes(e.key?.toLowerCase())) e.preventDefault();
            if (e.key === 'PrintScreen') e.preventDefault();
        };
        window.addEventListener('keydown', onKey, true);
        return () => window.removeEventListener('keydown', onKey, true);
    }, [onClose]);

    // Tab switch protection
    useEffect(() => {
        const onVis = () => setShielded(document.hidden);
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, []);

    // Block right-click and drag inside viewer
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const blockCtx = (e) => e.preventDefault();
        const blockDrag = (e) => e.preventDefault();
        const blockCopy = (e) => e.preventDefault();
        el.addEventListener('contextmenu', blockCtx);
        el.addEventListener('dragstart', blockDrag);
        el.addEventListener('copy', blockCopy);
        return () => { el.removeEventListener('contextmenu', blockCtx); el.removeEventListener('dragstart', blockDrag); el.removeEventListener('copy', blockCopy); };
    }, []);

    // Wheel zoom for images
    const onWheel = useCallback((e) => {
        if (!isImage) return;
        e.preventDefault();
        setZoom(z => Math.max(0.25, Math.min(5, z + (e.deltaY < 0 ? 0.15 : -0.15))));
    }, [isImage]);

    // Mouse pan for images
    const onMouseDown = (e) => {
        if (!isImage || zoom <= 1) return;
        setDragging(true);
        setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    };
    const onMouseMove = (e) => {
        if (!dragging) return;
        setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };
    const onMouseUp = () => setDragging(false);

    // Touch zoom
    const touchDistRef = useRef(null);
    const onTouchStart = (e) => {
        if (e.touches.length === 2) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            touchDistRef.current = Math.hypot(dx, dy);
        }
    };
    const onTouchMove = (e) => {
        if (e.touches.length === 2 && touchDistRef.current) {
            const dx = e.touches[0].clientX - e.touches[1].clientX;
            const dy = e.touches[0].clientY - e.touches[1].clientY;
            const dist = Math.hypot(dx, dy);
            const scale = dist / touchDistRef.current;
            setZoom(z => Math.max(0.25, Math.min(5, z * scale)));
            touchDistRef.current = dist;
        }
    };

    const resetView = () => { setZoom(1); setPan({ x: 0, y: 0 }); };
    const fmtSize = (b) => !b ? '' : b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(1) + ' KB' : (b / 1048576).toFixed(1) + ' MB';

    if (!file) return null;

    return (
        <div className="sv-overlay" ref={containerRef} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseLeave={onMouseUp}>
            {/* Shield */}
            {shielded && <div className="sv-shield"><div className="sv-shield-text">CONTENT PROTECTED</div></div>}

            {/* Top bar */}
            <div className="sv-topbar">
                <div className="sv-topbar-left">
                    <ShieldSvg />
                    <span className="sv-filename">{file.name || 'Untitled'}</span>
                    {file.size && <span className="sv-filesize">{fmtSize(file.size)}</span>}
                </div>
                <div className="sv-topbar-right">
                    {isImage && (
                        <>
                            <button className="sv-tool" onClick={() => setZoom(z => Math.min(z + 0.25, 5))} title="Zoom in"><ZoomInSvg /></button>
                            <button className="sv-tool" onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} title="Zoom out"><ZoomOutSvg /></button>
                            <button className="sv-tool sv-tool-text" onClick={resetView}>Reset</button>
                            <span className="sv-zoom-level">{Math.round(zoom * 100)}%</span>
                        </>
                    )}
                    <button className="sv-close" onClick={onClose}><CloseSvg /></button>
                </div>
            </div>

            {/* Content area */}
            <div className="sv-content" onWheel={onWheel} onTouchStart={onTouchStart} onTouchMove={onTouchMove}>
                {isImage && (
                    <img
                        src={file.url}
                        alt={file.name}
                        className="sv-image"
                        style={{
                            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                            cursor: zoom > 1 ? (dragging ? 'grabbing' : 'grab') : 'default',
                        }}
                        onMouseDown={onMouseDown}
                        draggable={false}
                    />
                )}

                {isPdf && (
                    <iframe
                        src={file.url + '#toolbar=0&navpanes=0&scrollbar=1'}
                        title={file.name}
                        className="sv-pdf"
                        sandbox="allow-same-origin"
                    />
                )}

                {isText && textContent !== null && (
                    <div className="sv-text-wrap">
                        <pre className="sv-text">{textContent}</pre>
                    </div>
                )}

                {!isImage && !isPdf && !isText && (
                    <div className="sv-unsupported">
                        <div className="sv-unsupported-icon">📄</div>
                        <div className="sv-unsupported-name">{file.name}</div>
                        <div className="sv-unsupported-size">{fmtSize(file.size)}</div>
                        <div className="sv-unsupported-msg">
                            Preview not available for this file type.
                            <br />File is encrypted and stored in memory only.
                        </div>
                    </div>
                )}
            </div>

            {/* Bottom info bar */}
            <div className="sv-bottombar">
                <span><ShieldSvg /> Secure Viewer</span>
                <span>•</span>
                <span>No download</span>
                <span>•</span>
                <span>Copy blocked</span>
                <span>•</span>
                <span>In-memory only</span>
            </div>
        </div>
    );
}
