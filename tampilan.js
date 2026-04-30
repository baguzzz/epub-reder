/**
 * Modul Pengatur Tampilan EPUB Reader
 * Simpan pengaturan di localStorage dan hasilkan CSS kustom.
 */
(function(window) {
    'use strict';

    // ---------- Pengaturan Default ----------
    const DEFAULTS = {
        fontFamily: 'Georgia, "Times New Roman", serif',
        fontSize: 16,        // px
        lineHeight: 1.6,
        margin: 2,           // rem
        nightMode: false
    };

    // ---------- Ambil/Simpan di localStorage ----------
    function loadSettings() {
        try {
            const saved = localStorage.getItem('epub-tampilan');
            return saved ? JSON.parse(saved) : { ...DEFAULTS };
        } catch (e) {
            return { ...DEFAULTS };
        }
    }

    function saveSettings(settings) {
        try {
            localStorage.setItem('epub-tampilan', JSON.stringify(settings));
        } catch (e) {}
    }

    let settings = loadSettings();

    // ---------- Fungsi Utama: Hasilkan String CSS ----------
    function getCSS() {
    const s = settings;
    return `
        body, .page {
            font-family: ${s.fontFamily} !important;
            font-size: ${s.fontSize}px !important;
            line-height: ${s.lineHeight} !important;
            padding: ${s.margin}rem !important;
            color: ${s.nightMode ? '#ddd' : '#1e2a3a'} !important;
            background-color: ${s.nightMode ? '#1a1a1a' : '#fffaf2'} !important;
            transition: background-color 0.3s, color 0.3s;
        }
        /* Override untuk warna teks di berbagai elemen */
        p, div, span, li, blockquote {
            color: inherit;
        }
        a {
            color: ${s.nightMode ? '#88b4f5' : '#2980b9'};
        }
        /* Menjaga gambar tetap terang */
        img, svg, video {
            filter: ${s.nightMode ? 'brightness(0.9)' : 'none'};
        }
    `;
}

    /**
     * Terapkan CSS langsung ke iframe (jika sedang aktif).
     * viewerIframe adalah elemen iframe, atau null jika tidak ada.
     */
    function applyToIframe(viewerIframe) {
        if (!viewerIframe || !viewerIframe.contentDocument) return;
        try {
            const styleId = 'epub-custom-style';
            let styleEl = viewerIframe.contentDocument.getElementById(styleId);
            if (!styleEl) {
                styleEl = viewerIframe.contentDocument.createElement('style');
                styleEl.id = styleId;
                viewerIframe.contentDocument.head.appendChild(styleEl);
            }
            styleEl.textContent = getCSS();
        } catch (e) {
            console.warn('Tidak bisa mengakses style iframe:', e);
        }
    }

    // ---------- API Publik ----------
    window.Tampilan = {
        getSettings: () => ({ ...settings }),

        updateSetting: function(key, value) {
            if (settings.hasOwnProperty(key)) {
                settings[key] = value;
                saveSettings(settings);
                // Trigger event agar script.js bisa merespon
                window.dispatchEvent(new CustomEvent('tampilan-changed', { detail: settings }));
                return true;
            }
            return false;
        },

        resetSettings: function() {
            settings = { ...DEFAULTS };
            saveSettings(settings);
            window.dispatchEvent(new CustomEvent('tampilan-changed', { detail: settings }));
        },

        getCSS: getCSS,
        applyToIframe: applyToIframe,
        get nightMode() { return settings.nightMode; },
        set nightMode(val) { this.updateSetting('nightMode', val); }
    };

})(window);