(function() {
    // ---------- PARSER ZIP ----------
    async function unzipBuffer(arrayBuffer) {
        const buffer = arrayBuffer;
        const dataView = new DataView(buffer);
        let eocdOffset = -1;
        for (let i = buffer.byteLength - 22; i >= 0; i--) {
            if (dataView.getUint32(i, true) === 0x06054b50) {
                eocdOffset = i;
                break;
            }
        }
        if (eocdOffset === -1) throw new Error('Bukan file ZIP yang valid');
        const centralDirOffset = dataView.getUint32(eocdOffset + 16, true);
        const centralDirSize = dataView.getUint32(eocdOffset + 12, true);
        const centralDirEnd = centralDirOffset + centralDirSize;
        const entries = {};

        let pos = centralDirOffset;
        while (pos < centralDirEnd) {
            if (dataView.getUint32(pos, true) !== 0x02014b50) break;
            const compressionMethod = dataView.getUint16(pos + 10, true);
            const compressedSize = dataView.getUint32(pos + 20, true);
            const uncompressedSize = dataView.getUint32(pos + 24, true);
            const fileNameLength = dataView.getUint16(pos + 28, true);
            const extraFieldLength = dataView.getUint16(pos + 30, true);
            const fileCommentLength = dataView.getUint16(pos + 32, true);
            const localHeaderOffset = dataView.getUint32(pos + 42, true);

            const fileNameArray = new Uint8Array(buffer, pos + 46, fileNameLength);
            const fileName = new TextDecoder().decode(fileNameArray);

            entries[fileName] = {
                compressionMethod,
                compressedSize,
                uncompressedSize,
                localHeaderOffset
            };
            pos += 46 + fileNameLength + extraFieldLength + fileCommentLength;
        }

        return {
            file: async function(fileName) {
                const entry = entries[fileName];
                if (!entry) return null;
                const localView = new DataView(buffer, entry.localHeaderOffset);
                if (localView.getUint32(0, true) !== 0x04034b50) throw new Error('Local file header rusak');
                const localFileNameLength = localView.getUint16(26, true);
                const localExtraFieldLength = localView.getUint16(28, true);
                const dataOffset = entry.localHeaderOffset + 30 + localFileNameLength + localExtraFieldLength;
                const compressedData = new Uint8Array(buffer, dataOffset, entry.compressedSize);

                if (entry.compressionMethod === 0) return compressedData;
                if (entry.compressionMethod === 8) {
                    const ds = new DecompressionStream('deflate-raw');
                    const writer = ds.writable.getWriter();
                    const reader = ds.readable.getReader();
                    writer.write(compressedData);
                    writer.close();
                    const chunks = [];
                    while (true) {
                        const { done, value } = await reader.read();
                        if (done) break;
                        chunks.push(value);
                    }
                    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
                    const result = new Uint8Array(totalLength);
                    let offset = 0;
                    for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
                    return result;
                }
                throw new Error('Kompresi tidak didukung: ' + entry.compressionMethod);
            },
            getEntries: () => Object.keys(entries)
        };
    }

    // ---------- VARIABEL ----------
    let zip = null;
    let spineItems = [];
    let resources = {};
    let currentIndex = 0;
    let bookTitle = 'Tanpa Judul';
    let dualMode = false;

    const epubInput = document.getElementById('epubInput');
    const viewer = document.getElementById('viewer');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const bookMetaInfo = document.getElementById('bookMetaInfo');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const sidebar = document.getElementById('sidebar');
    const tocContainer = document.getElementById('tocContainer');
    const dualModeBtn = document.getElementById('dualModeBtn');

    // ---------- UTILITAS ----------
    function guessMediaType(path) {
        const ext = (path.split('.').pop() || '').toLowerCase();
        const map = {
            xhtml: 'application/xhtml+xml', html: 'text/html', htm: 'text/html',
            css: 'text/css', ncx: 'application/x-dtbncx+xml',
            png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
            svg: 'image/svg+xml', otf: 'font/otf', ttf: 'font/ttf', woff: 'font/woff',
            woff2: 'font/woff2', mp3: 'audio/mpeg', mp4: 'video/mp4'
        };
        return map[ext] || 'application/octet-stream';
    }

    function isTextMedia(mediaType) {
        return mediaType.startsWith('text/') || mediaType.includes('xml') ||
               mediaType === 'application/xhtml+xml' || mediaType === 'application/javascript';
    }

    function resolvePath(baseDir, relative) {
        if (relative.startsWith('/')) return relative.substring(1);
        const combined = baseDir + relative;
        const parts = combined.split('/');
        const stack = [];
        for (const part of parts) {
            if (part === '..') stack.pop();
            else if (part !== '.' && part !== '') stack.push(part);
        }
        return stack.join('/');
    }

    function uint8ToBase64(bytes) {
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
        return btoa(binary);
    }

    // ---------- PARSE EPUB ----------
    async function parseEpub(zipInstance) {
        const containerEntry = await zipInstance.file("META-INF/container.xml");
        if (!containerEntry) throw new Error("Bukan EPUB: META-INF/container.xml tidak ditemukan.");
        const containerXml = new TextDecoder().decode(containerEntry);
        const parser = new DOMParser();
        const containerDoc = parser.parseFromString(containerXml, "application/xml");
        const rootfile = containerDoc.querySelector("rootfile");
        if (!rootfile) throw new Error("container.xml tidak memiliki rootfile.");
        const opfPath = rootfile.getAttribute("full-path");
        const opfDir = opfPath.substring(0, opfPath.lastIndexOf('/') + 1);

        const opfData = await zipInstance.file(opfPath);
        if (!opfData) throw new Error("File OPF tidak ditemukan: " + opfPath);
        const opfXml = new TextDecoder().decode(opfData);
        const opfDoc = parser.parseFromString(opfXml, "application/xml");

        const titleEl = opfDoc.querySelector("dc\\:title, title");
        bookTitle = titleEl ? titleEl.textContent.trim() : 'Tanpa Judul';
        const creatorEl = opfDoc.querySelector("dc\\:creator, creator");
        const creator = creatorEl ? creatorEl.textContent.trim() : 'Penulis tidak diketahui';
        bookMetaInfo.textContent = `${bookTitle} — ${creator}`;

        const manifestItems = opfDoc.querySelectorAll("manifest > item");
        const manifest = {};
        manifestItems.forEach(item => {
            const id = item.getAttribute("id");
            const href = item.getAttribute("href");
            const mediaType = item.getAttribute("media-type");
            manifest[id] = { href: opfDir + href, mediaType };
        });

        const spineRefs = opfDoc.querySelectorAll("spine > itemref");
        spineItems = [];
        spineRefs.forEach(ref => {
            const idref = ref.getAttribute("idref");
            const item = manifest[idref];
            if (item) spineItems.push({ href: item.href, mediaType: item.mediaType });
        });
        if (spineItems.length === 0) throw new Error("Tidak ada item di spine.");

        const allPaths = zipInstance.getEntries();
        resources = {};
        for (const path of allPaths) {
            if (path.endsWith('/')) continue;
            const data = await zipInstance.file(path);
            const mediaType = guessMediaType(path);
            if (isTextMedia(mediaType)) {
                resources[path] = { content: new TextDecoder().decode(data), mediaType };
            } else {
                const mime = (mediaType === 'application/octet-stream') ? 'application/octet-stream' : mediaType;
                const base64 = uint8ToBase64(new Uint8Array(data));
                resources[path] = { content: `data:${mime};base64,${base64}`, mediaType: mime };
            }
        }
    }

    // ---------- RENDER SATU SECTION ----------
    function renderSingleSection(index) {
        const item = spineItems[index];
        if (!item) return '<body style="padding:2rem;">Konten tidak tersedia.</body>';
        const res = resources[item.href];
        if (!res || !res.content) return '<body style="padding:2rem;">Konten tidak tersedia.</body>';

        const baseDir = item.href.substring(0, item.href.lastIndexOf('/') + 1);
        const parser = new DOMParser();
        let doc;
        try {
            if (res.mediaType === 'application/xhtml+xml' || item.href.endsWith('.xhtml')) {
                doc = parser.parseFromString(res.content, 'application/xhtml+xml');
            } else {
                doc = parser.parseFromString(res.content, 'text/html');
            }
            if (doc.querySelector('parsererror')) doc = parser.parseFromString(res.content, 'text/html');
        } catch (e) {
            doc = parser.parseFromString(res.content, 'text/html');
        }

        remapResources(doc, baseDir);
        doc.querySelectorAll('script').forEach(s => s.remove());
        const body = doc.body;
        return body ? body.innerHTML : doc.documentElement.outerHTML;
    }

    // ---------- RENDER KE IFRAME ----------
    function renderCurrentView() {
        // Ambil CSS kustom dari modul Tampilan (jika ada)
        const customCSS = window.Tampilan ? window.Tampilan.getCSS() : '';

        let htmlContent = '';

        if (dualMode) {
            const leftBody = renderSingleSection(currentIndex);
            const rightBody = (currentIndex + 1 < spineItems.length) ? renderSingleSection(currentIndex + 1) : '';
            htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        html, body { margin: 0; padding: 0; height: 100%; }
        .dual-container { display: flex; width: 100%; height: 100%; }
        .page {
            flex: 1; overflow-y: auto; padding: 1.5rem; box-sizing: border-box;
            font-family: Georgia, 'Times New Roman', serif; line-height: 1.6;
            color: #1e2a3a; word-wrap: break-word; overflow-wrap: break-word;
        }
        .page:first-child { border-right: 1px solid #ddd; }
        img, svg, video { max-width: 100%; height: auto; }
        figure { margin: 1em 0; text-align: center; }
        /* KUSTOM TAMPILAN */
        ${customCSS}
    </style>
</head>
<body>
    <div class="dual-container">
        <div class="page">${leftBody}</div>
        <div class="page">${rightBody || '<p style="color:#999;">Halaman kosong</p>'}</div>
    </div>
</body>
</html>`;
        } else {
            const bodyContent = renderSingleSection(currentIndex);
            htmlContent = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <style>
        body {
            font-family: Georgia, 'Times New Roman', serif;
            margin: 0 auto; padding: 2rem 1.5rem; max-width: 800px;
            line-height: 1.6; color: #1e2a3a; word-wrap: break-word; overflow-wrap: break-word;
        }
        img, svg, video { max-width: 100%; height: auto; }
        figure { margin: 1em 0; text-align: center; }
        /* KUSTOM TAMPILAN */
        ${customCSS}
    </style>
</head>
<body>${bodyContent}</body>
</html>`;
        }

        viewer.srcdoc = htmlContent;
    }

    function remapResources(doc, baseDir) {
        const cssUrlRegex = /url\(["']?(.*?)["']?\)/g;
        function replaceAttr(el, attr) {
            const val = el.getAttribute(attr);
            if (!val || val.startsWith('data:')) return;
            const resolved = resolvePath(baseDir, val);
            const r = resources[resolved];
            if (r && r.content.startsWith('data:')) el.setAttribute(attr, r.content);
        }

        doc.querySelectorAll('img').forEach(img => replaceAttr(img, 'src'));
        doc.querySelectorAll('image').forEach(img => {
            if (img.hasAttribute('href')) replaceAttr(img, 'href');
            else if (img.hasAttributeNS('http://www.w3.org/1999/xlink', 'href')) {
                const href = img.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
                if (href && !href.startsWith('data:')) {
                    const resolved = resolvePath(baseDir, href);
                    const r = resources[resolved];
                    if (r && r.content.startsWith('data:')) {
                        img.setAttribute('href', r.content);
                        img.removeAttributeNS('http://www.w3.org/1999/xlink', 'href');
                    }
                }
            }
        });

        doc.querySelectorAll('link[rel="stylesheet"]').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || href.startsWith('data:')) return;
            const resolved = resolvePath(baseDir, href);
            const r = resources[resolved];
            if (r && r.mediaType === 'text/css') {
                const style = doc.createElement('style');
                style.textContent = r.content;
                link.replaceWith(style);
            }
        });

        doc.querySelectorAll('style').forEach(st => {
            st.textContent = st.textContent.replace(cssUrlRegex, (m, url) => {
                if (url.startsWith('data:')) return m;
                const resolved = resolvePath(baseDir, url);
                const r = resources[resolved];
                return r && r.content.startsWith('data:') ? `url(${r.content})` : m;
            });
        });

        doc.querySelectorAll('[style]').forEach(el => {
            const old = el.getAttribute('style');
            const n = old.replace(cssUrlRegex, (m, url) => {
                if (url.startsWith('data:')) return m;
                const resolved = resolvePath(baseDir, url);
                const r = resources[resolved];
                return r && r.content.startsWith('data:') ? `url(${r.content})` : m;
            });
            if (n !== old) el.setAttribute('style', n);
        });

        doc.querySelectorAll('video, audio, source').forEach(el => {
            if (el.hasAttribute('src')) replaceAttr(el, 'src');
        });
    }

    // ---------- NAVIGASI & TOC ----------
    function getMaxIndex() {
        if (dualMode) {
            return spineItems.length % 2 === 0 ? spineItems.length - 2 : spineItems.length - 1;
        }
        return spineItems.length - 1;
    }

    function updateNav() {
        const maxIdx = getMaxIndex();
        prevBtn.disabled = currentIndex === 0;
        nextBtn.disabled = currentIndex >= maxIdx;

        const links = tocContainer.querySelectorAll('.toc-link');
        links.forEach((link, i) => {
            const tocIndex = dualMode ? Math.floor(currentIndex / 2) : currentIndex;
            link.style.background = i === tocIndex ? '#e2c9a7' : '';
        });
    }

    function buildTocFromSpine() {
        tocContainer.innerHTML = '';
        const ul = document.createElement('ul');
        ul.className = 'toc-list';

        if (dualMode) {
            for (let i = 0; i < spineItems.length; i += 2) {
                const li = document.createElement('li');
                li.className = 'toc-item';
                const a = document.createElement('a');
                a.className = 'toc-link';
                const leftName = spineItems[i].href.split('/').pop().replace(/\.(xhtml|html|htm)$/, '');
                let label = leftName;
                if (i + 1 < spineItems.length) {
                    const rightName = spineItems[i + 1].href.split('/').pop().replace(/\.(xhtml|html|htm)$/, '');
                    label += ' | ' + rightName;
                }
                a.textContent = `${Math.floor(i/2)+1}. ${label}`;
                a.href = '#';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    currentIndex = i;
                    renderCurrentView();
                    updateNav();
                });
                li.appendChild(a);
                ul.appendChild(li);
            }
        } else {
            spineItems.forEach((item, i) => {
                const li = document.createElement('li');
                li.className = 'toc-item';
                const a = document.createElement('a');
                a.className = 'toc-link';
                a.textContent = `${i+1}. ${item.href.split('/').pop().replace(/\.(xhtml|html|htm)$/, '')}`;
                a.href = '#';
                a.addEventListener('click', (e) => {
                    e.preventDefault();
                    currentIndex = i;
                    renderCurrentView();
                    updateNav();
                });
                li.appendChild(a);
                ul.appendChild(li);
            });
        }
        tocContainer.appendChild(ul);
    }

    function goNext() {
        const step = dualMode ? 2 : 1;
        if (currentIndex + step < spineItems.length) {
            currentIndex += step;
            if (dualMode && currentIndex >= spineItems.length) currentIndex = spineItems.length - 1;
            renderCurrentView();
            updateNav();
        }
    }

    function goPrev() {
        const step = dualMode ? 2 : 1;
        if (currentIndex - step >= 0) {
            currentIndex -= step;
            renderCurrentView();
            updateNav();
        }
    }

    // ---------- EVENT ----------
    dualModeBtn.addEventListener('click', () => {
        dualMode = !dualMode;
        dualModeBtn.classList.toggle('active', dualMode);
        dualModeBtn.textContent = dualMode ? '📖 Satu Halaman' : '📖 Dua Halaman';
        if (dualMode && currentIndex % 2 !== 0) {
            currentIndex = Math.max(0, currentIndex - 1);
        }
        buildTocFromSpine();
        renderCurrentView();
        updateNav();
    });

    epubInput.addEventListener('change', async e => {
        const file = e.target.files[0];
        if (!file) return;
        try {
            const buffer = await file.arrayBuffer();
            zip = await unzipBuffer(buffer);
            await parseEpub(zip);
            currentIndex = 0;
            dualMode = false;
            dualModeBtn.classList.remove('active');
            dualModeBtn.textContent = '📖 Dua Halaman';
            renderCurrentView();
            viewer.style.display = 'block';
            prevBtn.disabled = false;
            nextBtn.disabled = false;
            buildTocFromSpine();
            updateNav();
        } catch (err) {
            alert('Gagal membaca EPUB: ' + err.message);
            console.error(err);
        }
    });

    prevBtn.onclick = goPrev;
    nextBtn.onclick = goNext;
    toggleSidebarBtn.onclick = () => sidebar.classList.toggle('collapsed');

    // ---------- KONTROL TAMPILAN (dari tampilan.js) ----------
    const displayBtn = document.getElementById('displayBtn');
    const displayPanel = document.getElementById('displayPanel');
    const fontFamilySelect = document.getElementById('fontFamilySelect');
    const fontSizeSlider = document.getElementById('fontSizeSlider');
    const fontSizeValue = document.getElementById('fontSizeValue');
    const lineHeightSlider = document.getElementById('lineHeightSlider');
    const lineHeightValue = document.getElementById('lineHeightValue');
    const marginSlider = document.getElementById('marginSlider');
    const marginValue = document.getElementById('marginValue');
    const nightModeCheckbox = document.getElementById('nightModeCheckbox');
    const resetDisplayBtn = document.getElementById('resetDisplayBtn');

    // Toggle panel
    displayBtn.addEventListener('click', () => {
        displayPanel.style.display = displayPanel.style.display === 'none' ? 'block' : 'none';
    });

    // Sinkronisasi kontrol dengan nilai dari Tampilan
    function syncControls() {
        if (!window.Tampilan) return;
        const s = window.Tampilan.getSettings();
        fontFamilySelect.value = s.fontFamily;
        fontSizeSlider.value = s.fontSize;
        fontSizeValue.textContent = s.fontSize + 'px';
        lineHeightSlider.value = s.lineHeight;
        lineHeightValue.textContent = s.lineHeight;
        marginSlider.value = s.margin;
        marginValue.textContent = s.margin + ' rem';
        nightModeCheckbox.checked = s.nightMode;
    }

    // Panggil saat pertama kali script dimuat
    syncControls();

    // Event listener untuk perubahan kontrol
    fontFamilySelect.addEventListener('change', function() {
        window.Tampilan.updateSetting('fontFamily', this.value);
        syncControls();
        renderCurrentView();
    });

    fontSizeSlider.addEventListener('input', function() {
        window.Tampilan.updateSetting('fontSize', parseInt(this.value));
        fontSizeValue.textContent = this.value + 'px';
        renderCurrentView();
    });

    lineHeightSlider.addEventListener('input', function() {
        window.Tampilan.updateSetting('lineHeight', parseFloat(this.value));
        lineHeightValue.textContent = this.value;
        renderCurrentView();
    });

    marginSlider.addEventListener('input', function() {
        window.Tampilan.updateSetting('margin', parseFloat(this.value));
        marginValue.textContent = this.value + ' rem';
        renderCurrentView();
    });

    nightModeCheckbox.addEventListener('change', function() {
        window.Tampilan.updateSetting('nightMode', this.checked);
        syncControls();
        renderCurrentView();
    });

    resetDisplayBtn.addEventListener('click', function() {
        window.Tampilan.resetSettings();
        syncControls();
        renderCurrentView();
    });

    // Jika ada perubahan dari tempat lain (mis. localStorage), render ulang
    window.addEventListener('tampilan-changed', function(e) {
        syncControls();
        if (viewer.style.display !== 'none') {
            renderCurrentView();
        }
    });

    // Drag & Drop
    document.body.addEventListener('dragover', e => e.preventDefault());
    document.body.addEventListener('drop', async e => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.name.toLowerCase().endsWith('.epub')) {
            const dt = new DataTransfer();
            dt.items.add(file);
            epubInput.files = dt.files;
            epubInput.dispatchEvent(new Event('change'));
        }
    });
})();