document.addEventListener('DOMContentLoaded', () => {
    const tabContainer = document.querySelector('.tab-bar');
    const editorContainer = document.getElementById('editor-container');
    const editorArea = document.querySelector('.editor-area');
    const lineColStatus = document.getElementById('line-col-status');
    const languageStatus = document.getElementById('language-status');

    const sidebar = document.getElementById('sidebar');
    const sidebarResizer = document.getElementById('sidebar-resizer');
    const sidebarFileList = document.querySelector('.file-list');
    const newFileBtn = document.getElementById('new-file-btn');
    const openFileBtn = document.getElementById('open-file-btn');
    const fileInput = document.getElementById('file-input');
    const saveFileBtn = document.getElementById('save-file-btn');

    let editor;
    let openTabs = {};
    let nextTabIdCounter = 1;
    let untitledFileCounter = 1;
    let activeTabId = null;

    const LS_OPEN_TABS = 'webEditorOpenTabs';
    const LS_ACTIVE_TAB = 'webEditorActiveTab';
    const LS_NEXT_TAB_ID_COUNTER = 'webEditorNextTabIdCounter';
    const LS_UNTITLED_COUNTER = 'webEditorUntitledCounter';
    const LS_SIDEBAR_WIDTH = 'webEditorSidebarWidth';

    // --- Sidebar Resizing Logic ---
    const DEFAULT_SIDEBAR_WIDTH = 250;
    const MIN_SIDEBAR_WIDTH = 150;
    const MAX_SIDEBAR_WIDTH = 500;

    function setSidebarWidth(width) {
        const newWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(width, MAX_SIDEBAR_WIDTH));
        if (sidebar) {
            sidebar.style.width = `${newWidth}px`;
        }
        if (editor) {
            editor.refresh();
        }
    }

    function loadSidebarWidth() {
        const savedWidth = localStorage.getItem(LS_SIDEBAR_WIDTH);
        if (savedWidth) {
            setSidebarWidth(parseInt(savedWidth, 10));
        } else {
            setSidebarWidth(DEFAULT_SIDEBAR_WIDTH);
        }
    }

    if (sidebarResizer && sidebar) {
        let isResizing = false;
        let startX, startWidth;
        sidebarResizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = parseInt(document.defaultView.getComputedStyle(sidebar).width, 10);
            document.body.style.userSelect = 'none';
            document.body.style.pointerEvents = 'none';
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        function handleMouseMove(e) {
            if (!isResizing) return;
            const diffX = e.clientX - startX;
            setSidebarWidth(startWidth + diffX);
        }
        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false;
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.userSelect = '';
            document.body.style.pointerEvents = '';
            if (sidebar) {
                localStorage.setItem(LS_SIDEBAR_WIDTH, sidebar.style.width);
            }
        }
    }
    // --- End Sidebar Resizing Logic ---

    // --- Local Storage Functions ---
    function saveStateToLocalStorage() {
        const tabsToSave = {};
        for (const id in openTabs) {
            if (openTabs.hasOwnProperty(id)) {
                tabsToSave[id] = {
                    id: openTabs[id].id,
                    filename: openTabs[id].filename,
                    filetype: openTabs[id].filetype,
                    content: (id === activeTabId && editor) ? editor.getValue() : openTabs[id].content,
                    isDirty: openTabs[id].isDirty,
                    isFromLocalFile: openTabs[id].isFromLocalFile,
                    isUntitled: openTabs[id].isUntitled
                };
            }
        }
        localStorage.setItem(LS_OPEN_TABS, JSON.stringify(tabsToSave));
        if (activeTabId) {
             localStorage.setItem(LS_ACTIVE_TAB, activeTabId);
        } else {
             localStorage.removeItem(LS_ACTIVE_TAB);
        }
        localStorage.setItem(LS_NEXT_TAB_ID_COUNTER, nextTabIdCounter.toString());
        localStorage.setItem(LS_UNTITLED_COUNTER, untitledFileCounter.toString());
    }

    function loadStateFromLocalStorage() {
        const savedTabs = localStorage.getItem(LS_OPEN_TABS);
        const savedActiveTab = localStorage.getItem(LS_ACTIVE_TAB);
        const savedNextTabIdCounter = localStorage.getItem(LS_NEXT_TAB_ID_COUNTER);
        const savedUntitledCounter = localStorage.getItem(LS_UNTITLED_COUNTER);

        if (savedTabs) {
            try {
                openTabs = JSON.parse(savedTabs);
                activeTabId = savedActiveTab || null;
                if (savedNextTabIdCounter) {
                    nextTabIdCounter = parseInt(savedNextTabIdCounter, 10);
                    if (isNaN(nextTabIdCounter) || nextTabIdCounter < 1) nextTabIdCounter = 1;
                } else {
                    nextTabIdCounter = 1;
                    Object.keys(openTabs).forEach(tabKey => {
                        const num = parseInt(tabKey.replace('tab-', ''), 10);
                        if (!isNaN(num) && num >= nextTabIdCounter) nextTabIdCounter = num + 1;
                    });
                }
                if (savedUntitledCounter) {
                    untitledFileCounter = parseInt(savedUntitledCounter, 10);
                    if (isNaN(untitledFileCounter) || untitledFileCounter < 1) untitledFileCounter = 1;
                } else {
                    untitledFileCounter = 1;
                     Object.values(openTabs).forEach(tab => {
                        if (tab.filename && tab.filename.startsWith("untitled-")) {
                            const num = parseInt(tab.filename.replace("untitled-", "").split('.')[0], 10);
                            if (!isNaN(num) && num >= untitledFileCounter) {
                                untitledFileCounter = num + 1;
                            }
                        }
                    });
                }

                for (const id in openTabs) {
                    if (openTabs.hasOwnProperty(id)) {
                        openTabs[id].isDirty = !!openTabs[id].isDirty;
                        openTabs[id].isFromLocalFile = !!openTabs[id].isFromLocalFile;
                        openTabs[id].isUntitled = !!openTabs[id].isUntitled;
                    }
                }
                return Object.keys(openTabs).length > 0;
            } catch (e) {
                console.error("Error parsing saved state:", e);
                localStorage.removeItem(LS_OPEN_TABS);
                localStorage.removeItem(LS_ACTIVE_TAB);
                localStorage.removeItem(LS_NEXT_TAB_ID_COUNTER);
                localStorage.removeItem(LS_UNTITLED_COUNTER);
                openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1;
                return false;
            }
        }
        return false;
    }

    // --- Initialize Editor ---
    if (editorContainer) {
        editor = CodeMirror(editorContainer, {
            value: "",
            mode: "text/plain",
            theme: "material-darker",
            lineNumbers: true,
            autoCloseBrackets: true, autoCloseTags: true, styleActiveLine: true, lineWrapping: true,
            foldGutter: true, gutters: ["CodeMirror-linenumbers", "CodeMirror-foldgutter"],
            extraKeys: {
                "Ctrl-Space": "autocomplete",
                "Cmd-Space": "autocomplete", // For Mac
                "Ctrl-/": "toggleComment",   // For Windows/Linux
                "Cmd-/": "toggleComment"     // For Mac
            },
            hintOptions: { completeSingle: false }
        });
        editor.on("cursorActivity", updateStatusBar);
        editor.on("change", (cmInstance, changeObj) => {
            if (activeTabId && openTabs[activeTabId] && changeObj.origin !== 'setValue') {
                if (!openTabs[activeTabId].isDirty) {
                    openTabs[activeTabId].isDirty = true;
                    renderTabs();
                }
            }
        });
    } else { console.error("Editor container not found!"); }

    function getMimeType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "text/plain";
        let extension = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (extension) {
            case "js": case "javascript": return "text/javascript";
            case "json": return "application/json";
            case "html": return "text/html";
            case "css": return "text/css";
            case "xml": return "application/xml";
            case "txt": case "text": return "text/plain";
            default: return "text/plain";
        }
    }
    function getDisplayFileType(filetypeOrFilename) {
        if (!filetypeOrFilename) return "Text";
        let extension = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (extension) {
            case "js": case "javascript": return "JavaScript";
            case "json": return "JSON";
            case "html": return "HTML";
            case "css": return "CSS";
            case "xml": return "XML";
            case "txt": case "text": return "Text";
            default: return "Text";
        }
    }

    function renderSidebarFileList() {
        sidebarFileList.innerHTML = '';
        const sortedTabs = Object.values(openTabs).sort((a,b) => (a.filename || "").localeCompare(b.filename || ""));

        if (sortedTabs.length === 0 && sidebarFileList.firstChild === null) {
             // CSS :empty::before handles this
        } else {
            sortedTabs.forEach(tabData => {
                const li = document.createElement('li');
                li.className = 'file-item' + (tabData.id === activeTabId ? ' active' : '');
                li.textContent = tabData.filename;
                li.dataset.tabId = tabData.id;
                li.title = tabData.filename;
                li.addEventListener('click', () => switchToTab(tabData.id));
                sidebarFileList.appendChild(li);
            });
        }
    }

    function renderTabs() {
        tabContainer.innerHTML = '';
        let hasActiveTab = false;
        const sortedTabIds = Object.keys(openTabs).sort((a, b) => {
            return (openTabs[a].filename || "").localeCompare(openTabs[b].filename || "");
        });

        sortedTabIds.forEach(id => {
            if (openTabs.hasOwnProperty(id)) {
                const tabData = openTabs[id];
                const tabDiv = document.createElement('div');
                tabDiv.className = 'tab' + (id === activeTabId ? ' active' : '');
                if (id === activeTabId) hasActiveTab = true;
                tabDiv.dataset.tabId = id;

                const filenameSpan = document.createElement('span');
                filenameSpan.className = 'tab-filename';
                filenameSpan.textContent = tabData.filename;
                filenameSpan.title = tabData.filename;
                filenameSpan.addEventListener('dblclick', () => promptRenameTab(id));
                tabDiv.appendChild(filenameSpan);

                if (tabData.isDirty) {
                    const dirtyIndicator = document.createElement('span');
                    dirtyIndicator.className = 'dirty-indicator';
                    tabDiv.appendChild(dirtyIndicator);
                }

                const closeBtn = document.createElement('span');
                closeBtn.className = 'close-tab';
                closeBtn.innerHTML = '&times;';
                closeBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    closeTab(id);
                });
                tabDiv.appendChild(closeBtn);
                tabContainer.appendChild(tabDiv);
            }
        });
        updateEditorAreaIndicator(hasActiveTab);
        renderSidebarFileList();
        saveStateToLocalStorage();
    }

    function updateEditorAreaIndicator(hasActiveTab) {
        if (hasActiveTab) {
            editorArea.classList.add('active-tab-indicator');
        } else {
            editorArea.classList.remove('active-tab-indicator');
        }
    }

    function createNewUntitledFile() {
        const filename = `untitled-${untitledFileCounter++}.txt`;
        const filetype = getDisplayFileType(filename);
        openNewTab(filename, filetype, "", false, null, false, true);
    }

    function promptRenameTab(tabId) {
        console.log("Attempting to rename tab:", tabId); // DEBUGGING
        if (!openTabs[tabId]) {
            console.error("promptRenameTab: No tab data found for ID", tabId);
            return;
        }
        const currentFilename = openTabs[tabId].filename;
        const newFilename = prompt("Enter new filename:", currentFilename);

        if (newFilename && newFilename.trim() !== "" && newFilename !== currentFilename) {
            const trimmedNewFilename = newFilename.trim();
            const isDuplicate = Object.values(openTabs).some(tab => tab.id !== tabId && tab.filename === trimmedNewFilename);
            if (isDuplicate) {
                alert(`A file named "${trimmedNewFilename}" is already open. Please choose a different name.`);
                return;
            }
            openTabs[tabId].filename = trimmedNewFilename;
            openTabs[tabId].filetype = getDisplayFileType(trimmedNewFilename);
            openTabs[tabId].isDirty = true;
            openTabs[tabId].isUntitled = false;
            renderTabs();
            if (tabId === activeTabId) {
                if (languageStatus) languageStatus.textContent = openTabs[tabId].filetype;
                if (editor) editor.setOption("mode", getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename));
            }
        }
    }

    function openNewTab(filename, filetype, content = '', isDirty = false, existingId = null, isFromLocal = false, isUnt = false) {
        const newId = existingId || `tab-${nextTabIdCounter++}`;
        openTabs[newId] = {
            id: newId, filename, filetype, content, isDirty,
            isFromLocalFile: isFromLocal,
            isUntitled: isUnt
        };
        switchToTab(newId);
        return newId;
    }

    function switchToTab(tabId) {
        if (!openTabs[tabId]) {
            console.warn(`Attempted to switch to non-existent tabId: ${tabId}`);
            const remainingTabIds = Object.keys(openTabs);
            activeTabId = remainingTabIds.length > 0 ? Object.values(openTabs).sort((a,b) => (a.filename || "").localeCompare(b.filename || ""))[0].id : null;
            
            if (!activeTabId && editor) {
                editor.setValue(""); editor.setOption("mode", "text/plain"); editor.clearHistory();
                if(languageStatus) languageStatus.textContent = "Text";
            }
            renderTabs(); 
            if (activeTabId && openTabs[activeTabId] && editor) {
                 editor.setValue(openTabs[activeTabId].content);
                 editor.setOption("mode", getMimeType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename));
                 editor.clearHistory();
                 editor.focus();
                 if(languageStatus) languageStatus.textContent = getDisplayFileType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename);
            }
            updateStatusBar();
            return;
        }

        if (activeTabId && openTabs[activeTabId] && editor) {
            openTabs[activeTabId].content = editor.getValue();
        }
        activeTabId = tabId;

        if (editor) {
            editor.setValue(openTabs[tabId].content);
            editor.setOption("mode", getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename));
            editor.clearHistory();
            editor.focus(); // Ensure editor gets focus when tab is switched
            if (languageStatus) languageStatus.textContent = getDisplayFileType(openTabs[tabId].filetype || openTabs[tabId].filename);
        }
        renderTabs();
        updateStatusBar();
    
        document.querySelectorAll('.sidebar .file-item.active').forEach(item => item.classList.remove('active'));
        const sidebarItem = sidebarFileList.querySelector(`.file-item[data-tab-id="${tabId}"]`);
        if(sidebarItem) sidebarItem.classList.add('active');
    }

    function closeTab(tabIdToClose) {
        if (!openTabs[tabIdToClose]) return;
        if (openTabs[tabIdToClose].isDirty) {
            if (!confirm(`File "${openTabs[tabIdToClose].filename}" has unsaved changes. Close anyway?`)) {
                return;
            }
        }
        delete openTabs[tabIdToClose];

        if (activeTabId === tabIdToClose) {
            activeTabId = null;
            const remainingTabIds = Object.keys(openTabs);
            if (remainingTabIds.length > 0) {
                const nextActive = Object.values(openTabs).sort((a,b) => (a.filename || "").localeCompare(b.filename || ""))[0].id;
                switchToTab(nextActive);
            } else {
                if (editor) { editor.setValue(""); editor.setOption("mode", "text/plain"); editor.clearHistory(); }
                renderTabs();
                updateStatusBar();
                if (languageStatus) languageStatus.textContent = "Text";
            }
        } else {
            renderTabs();
        }
    }

    if (tabContainer) {
        tabContainer.addEventListener('click', (event) => {
            let clickedEl = event.target;
            while (clickedEl && clickedEl !== tabContainer && !clickedEl.classList.contains('tab')) {
                clickedEl = clickedEl.parentElement;
            }
            if (clickedEl && clickedEl.classList.contains('tab') && clickedEl.dataset.tabId) {
                if (activeTabId !== clickedEl.dataset.tabId) {
                    switchToTab(clickedEl.dataset.tabId);
                }
            }
        });
    }

    function updateStatusBar() {
         if (!editor || !lineColStatus) return;
        const cursor = editor.getCursor();
        lineColStatus.textContent = `Line: ${cursor.line + 1}, Col: ${cursor.ch + 1}`;
    }

    if (newFileBtn) {
        newFileBtn.addEventListener('click', createNewUntitledFile);
    }
    if (openFileBtn) {
        openFileBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) {
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;
                    const filename = file.name;
                    const filetype = getDisplayFileType(filename);
                    openNewTab(filename, filetype, content, false, null, true, false);
                    fileInput.value = null;
                };
                reader.readAsText(file);
            }
        });
    }
    if (saveFileBtn) {
        saveFileBtn.addEventListener('click', () => {
            if (!activeTabId || !openTabs[activeTabId]) {
                alert("No active file to save!"); return;
            }
            const tabData = openTabs[activeTabId];
            if (tabData.isUntitled || (tabData.filename && tabData.filename.startsWith("untitled-"))) {
                const newName = prompt("Save as:", tabData.filename);
                if (newName && newName.trim() !== "") {
                    const trimmedNewName = newName.trim();
                    const isDuplicate = Object.values(openTabs).some(tab => tab.id !== activeTabId && tab.filename === trimmedNewName);
                    if (isDuplicate) {
                        alert(`A file named "${trimmedNewName}" is already open. Please save with a different name.`);
                        return;
                    }
                    tabData.filename = trimmedNewName;
                    tabData.filetype = getDisplayFileType(trimmedNewName);
                    tabData.isUntitled = false;
                } else { return; } 
            }

            const content = editor.getValue();
            const filename = tabData.filename;
            const blob = new Blob([content], { type: getMimeType(tabData.filetype || filename) });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            openTabs[activeTabId].isDirty = false;
            openTabs[activeTabId].content = content;
            if(languageStatus && openTabs[activeTabId]) languageStatus.textContent = openTabs[activeTabId].filetype;
            renderTabs();
            console.log(`${filename} saved.`);
        });
    }

    // --- Keyboard Shortcuts ---
    document.addEventListener('keydown', function(e) {
        const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
        const modKey = isMac ? e.metaKey : e.ctrlKey;

        // Give CodeMirror a chance to handle its own shortcuts first if it has focus
        if (editor && editor.hasFocus() && editor.getInputField() === document.activeElement) {
            // For Ctrl+/ or Cmd+/, CodeMirror's extraKeys should handle it.
            // We don't need to do anything special here for those.
        }

        if (modKey && e.key.toLowerCase() === 's') {
            e.preventDefault();
            saveFileBtn.click();
        } else if (modKey && e.key.toLowerCase() === 'n') {
            e.preventDefault();
            createNewUntitledFile();
        } else if (modKey && e.key.toLowerCase() === 'o') {
            e.preventDefault();
            openFileBtn.click();
        } else if (modKey && e.key.toLowerCase() === 'w') {
            e.preventDefault();
            if (activeTabId) {
                closeTab(activeTabId);
            }
        } else if (e.key === 'F2') {
            console.log("F2 keydown event detected on document."); // DEBUGGING
            e.preventDefault(); // Prevent any default F2 browser behavior
            if (activeTabId) {
                promptRenameTab(activeTabId);
            } else {
                console.log("F2 pressed, but no active tab to rename.");
            }
        }
    });

    window.addEventListener('beforeunload', (event) => {
        if (activeTabId && openTabs[activeTabId] && editor && openTabs[activeTabId].isDirty) {
             openTabs[activeTabId].content = editor.getValue();
        }
        saveStateToLocalStorage();
        let hasUnsavedChanges = false;
        for (const id in openTabs) { if (openTabs[id].isDirty) { hasUnsavedChanges = true; break; } }
        if (hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; }
    });

    // --- Initial Load ---
    loadSidebarWidth();
    const stateLoaded = loadStateFromLocalStorage();
    if (stateLoaded) {
        renderTabs();
        let tabToActivate = activeTabId;
        if (!tabToActivate || !openTabs[tabToActivate]) {
            const sortedRestoredTabs = Object.values(openTabs).sort((a,b) => (a.filename||"").localeCompare(b.filename||""));
            tabToActivate = sortedRestoredTabs.length > 0 ? sortedRestoredTabs[0].id : null;
        }
        if (tabToActivate) {
            switchToTab(tabToActivate);
        } else {
            activeTabId = null;
            createNewUntitledFile();
        }
    } else {
        openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1;
        createNewUntitledFile();
    }
});
