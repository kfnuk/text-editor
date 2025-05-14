document.addEventListener('DOMContentLoaded', () => {
    const tabContainer = document.querySelector('.tab-bar');
    const editorContainer = document.getElementById('editor-container');
    const editorArea = document.querySelector('.editor-area');
    const lineColStatus = document.getElementById('line-col-status');
    const languageStatus = document.getElementById('language-status');

    const sidebar = document.getElementById('sidebar'); // For resizer
    const sidebarResizer = document.getElementById('sidebar-resizer'); // For resizer
    const sidebarFileList = document.querySelector('.file-list');
    const newFileBtn = document.getElementById('new-file-btn'); // New button
    const openFileBtn = document.getElementById('open-file-btn');
    const fileInput = document.getElementById('file-input');
    const saveFileBtn = document.getElementById('save-file-btn');

    let editor;
    let openTabs = {};
    let nextTabIdCounter = 1; // For generating unique part of tab IDs
    let untitledFileCounter = 1; // For naming new untitled files
    let activeTabId = null;

    const LS_OPEN_TABS = 'webEditorOpenTabs';
    const LS_ACTIVE_TAB = 'webEditorActiveTab';
    const LS_NEXT_TAB_ID_COUNTER = 'webEditorNextTabIdCounter';
    const LS_UNTITLED_COUNTER = 'webEditorUntitledCounter';
    const LS_SIDEBAR_WIDTH = 'webEditorSidebarWidth'; // From previous step

    // Remove projectFileContents as we are not loading default project files anymore
    // const projectFileContents = { ... };

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
            tabsToSave[id] = {
                id: openTabs[id].id,
                filename: openTabs[id].filename,
                filetype: openTabs[id].filetype,
                content: (id === activeTabId && editor) ? editor.getValue() : openTabs[id].content,
                isDirty: openTabs[id].isDirty,
                isFromLocalFile: openTabs[id].isFromLocalFile // Persist this flag
            };
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
                    if (isNaN(nextTabIdCounter)) nextTabIdCounter = 1;
                } else {
                    nextTabIdCounter = 1; // Default if not found
                    Object.keys(openTabs).forEach(tabKey => { // Estimate if needed
                        const num = parseInt(tabKey.replace('tab-', ''), 10);
                        if (!isNaN(num) && num >= nextTabIdCounter) nextTabIdCounter = num + 1;
                    });
                }
                if (savedUntitledCounter) {
                    untitledFileCounter = parseInt(savedUntitledCounter, 10);
                    if (isNaN(untitledFileCounter)) untitledFileCounter = 1;
                } else {
                    untitledFileCounter = 1; // Default
                     Object.values(openTabs).forEach(tab => {
                        if (tab.filename.startsWith("untitled-")) {
                            const num = parseInt(tab.filename.replace("untitled-", ""), 10);
                            if (!isNaN(num) && num >= untitledFileCounter) {
                                untitledFileCounter = num + 1;
                            }
                        }
                    });
                }

                for (const id in openTabs) {
                    openTabs[id].isDirty = !!openTabs[id].isDirty;
                    openTabs[id].isFromLocalFile = !!openTabs[id].isFromLocalFile;
                }
                return Object.keys(openTabs).length > 0;
            } catch (e) {
                console.error("Error parsing saved state:", e);
                localStorage.clear(); // Clear all app-specific storage on error
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
            extraKeys: { "Ctrl-Space": "autocomplete" },
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

    function getMimeType(filetypeOrFilename) { /* ... (same as before) ... */ 
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
    function getDisplayFileType(filetypeOrFilename) { /* ... (same as before) ... */ 
        if (!filetypeOrFilename) return "Text";
        let extension = filetypeOrFilename.includes('.') ? filetypeOrFilename.split('.').pop().toLowerCase() : filetypeOrFilename.toLowerCase();
        switch (extension) {
            case "js": case "javascript": return "JavaScript";
            case "json": return "JSON";
            case "html": return "HTML";
            case "css": return "CSS";
            case "xml": return "XML";
            case "txt": case "text": return "Text";
            default: return "Text"; // Default to Text for unknown extensions
        }
    }

    function renderSidebarFileList() {
        sidebarFileList.innerHTML = ''; // Clear current list
        const sortedTabs = Object.values(openTabs).sort((a,b) => a.filename.localeCompare(b.filename));

        if (sortedTabs.length === 0) {
             // The :empty::before CSS pseudo-element will show "No files open"
        } else {
            sortedTabs.forEach(tabData => {
                const li = document.createElement('li');
                li.className = 'file-item' + (tabData.id === activeTabId ? ' active' : '');
                li.textContent = tabData.filename;
                li.dataset.tabId = tabData.id; // Link to tabId
                li.addEventListener('click', () => switchToTab(tabData.id));
                sidebarFileList.appendChild(li);
            });
        }
    }


    function renderTabs() {
        tabContainer.innerHTML = '';
        let hasActiveTab = false;
        const sortedTabIds = Object.keys(openTabs).sort((a, b) => {
            // Sort by filename for consistent tab order, could also sort by an 'order' property if added
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
                filenameSpan.title = tabData.filename; // Show full name on hover
                filenameSpan.addEventListener('dblclick', () => promptRenameTab(id)); // Add rename handler
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
        renderSidebarFileList(); // Update sidebar list whenever tabs change
        saveStateToLocalStorage();
    }

    function updateEditorAreaIndicator(hasActiveTab) { /* ... (same as before) ... */ 
        if (hasActiveTab) {
            editorArea.classList.add('active-tab-indicator');
        } else {
            editorArea.classList.remove('active-tab-indicator');
        }
    }

    function createNewUntitledFile() {
        const filename = `untitled-${untitledFileCounter++}.txt`;
        const filetype = getDisplayFileType(filename);
        const newTabId = openNewTab(filename, filetype, "", false); // New files are not dirty
        openTabs[newTabId].isFromLocalFile = false; // Mark as not from local file system initially
        openTabs[newTabId].isUntitled = true; // Mark as untitled
    }

    function promptRenameTab(tabId) {
        if (!openTabs[tabId]) return;

        const currentFilename = openTabs[tabId].filename;
        const newFilename = prompt("Enter new filename:", currentFilename);

        if (newFilename && newFilename !== currentFilename) {
            // Check for duplicate filenames among open tabs
            const isDuplicate = Object.values(openTabs).some(tab => tab.id !== tabId && tab.filename === newFilename);
            if (isDuplicate) {
                alert(`A file named "${newFilename}" is already open. Please choose a different name.`);
                return;
            }

            openTabs[tabId].filename = newFilename;
            openTabs[tabId].filetype = getDisplayFileType(newFilename); // Update filetype based on new extension
            openTabs[tabId].isDirty = true; // Renaming usually implies a change to be saved
            openTabs[tabId].isUntitled = false; // No longer considered default "untitled"
            renderTabs(); // Re-render tabs to show new name and update sidebar
            if (tabId === activeTabId) { // If the active tab was renamed
                if (languageStatus) languageStatus.textContent = openTabs[tabId].filetype;
                editor.setOption("mode", getMimeType(openTabs[tabId].filetype || openTabs[tabId].filename));
            }
        }
    }


    function openNewTab(filename, filetype, content = '', isDirty = false, existingId = null, isFromLocal = false, isUnt = false) {
        const newId = existingId || `tab-${nextTabIdCounter++}`;
        openTabs[newId] = {
            id: newId, filename, filetype, content, isDirty,
            isFromLocalFile: isFromLocal,
            isUntitled: isUnt // Keep track if it's an "untitled-X" file
        };
        switchToTab(newId);
        return newId;
    }

    function switchToTab(tabId) { /* ... (same as before, ensure renderTabs() is called) ... */ 
        if (!openTabs[tabId]) {
            console.warn(`Attempted to switch to non-existent tabId: ${tabId}`);
            const remainingTabIds = Object.keys(openTabs);
            activeTabId = remainingTabIds.length > 0 ? remainingTabIds[0] : null;
            if (!activeTabId) { // No tabs left
                if(editor) editor.setValue(""); editor.setOption("mode", "text/plain"); editor.clearHistory();
                if(languageStatus) languageStatus.textContent = "Text";
            }
            renderTabs(); // This will call saveStateToLocalStorage
            if (activeTabId && openTabs[activeTabId] && editor) { // If we recovered a tab
                 editor.setValue(openTabs[activeTabId].content);
                 editor.setOption("mode", getMimeType(openTabs[activeTabId].filetype || openTabs[activeTabId].filename));
                 editor.clearHistory();
                 editor.focus();
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
            editor.focus();
        }
        renderTabs(); // This re-renders tabs, sidebar, and saves to LS
        updateStatusBar();
        if (languageStatus) languageStatus.textContent = getDisplayFileType(openTabs[tabId].filetype || openTabs[tabId].filename);
    
        // Update sidebar active item
        document.querySelectorAll('.sidebar .file-item.active').forEach(item => item.classList.remove('active'));
        const sidebarItem = sidebarFileList.querySelector(`.file-item[data-tab-id="${tabId}"]`);
        if(sidebarItem) sidebarItem.classList.add('active');
    }

    function closeTab(tabIdToClose) { /* ... (same as before, ensure switchToTab or renderTabs is called at the end) ... */ 
        if (openTabs[tabIdToClose] && openTabs[tabIdToClose].isDirty) {
            if (!confirm(`File "${openTabs[tabIdToClose].filename}" has unsaved changes. Close anyway?`)) {
                return;
            }
        }
        delete openTabs[tabIdToClose];

        if (activeTabId === tabIdToClose) {
            activeTabId = null;
            const remainingTabIds = Object.keys(openTabs);
            if (remainingTabIds.length > 0) {
                // Sort remaining tabs by filename (or original order if preferred) to pick next active
                const nextActive = Object.values(openTabs).sort((a,b) => a.filename.localeCompare(b.filename))[0].id;
                switchToTab(nextActive);
            } else { // No tabs left
                if (editor) { editor.setValue(""); editor.setOption("mode", "text/plain"); editor.clearHistory(); }
                renderTabs(); // Render empty state (calls saveState)
                updateStatusBar();
                if (languageStatus) languageStatus.textContent = "Text";
            }
        } else {
            renderTabs(); // Just re-render if a non-active tab was closed (calls saveState)
        }
    }

    if (tabContainer) { /* ... (event listener for tab clicks, calls switchToTab) ... */ 
        tabContainer.addEventListener('click', (event) => {
            let clickedEl = event.target;
            // Traverse up to find .tab element, but not beyond .tab-bar
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

    function updateStatusBar() { /* ... (same as before) ... */ 
         if (!editor || !lineColStatus) return;
        const cursor = editor.getCursor();
        lineColStatus.textContent = `Line: ${cursor.line + 1}, Column: ${cursor.ch + 1}`;
    }

    // Remove sidebarFileList event listener, as it's now populated by renderSidebarFileList
    // if (sidebarFileList) { ... }

    // "New File" button listener
    if (newFileBtn) {
        newFileBtn.addEventListener('click', createNewUntitledFile);
    }

    if (openFileBtn) { /* ... (same as before, but sets isFromLocalFile=true in openNewTab) ... */ 
        openFileBtn.addEventListener('click', () => fileInput.click());
    }
    if (fileInput) { /* ... (same as before, but sets isFromLocalFile=true in openNewTab) ... */ 
        fileInput.addEventListener('change', (event) => {
            const file = event.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const content = e.target.result;
                    const filename = file.name;
                    const filetype = getDisplayFileType(filename);
                    openNewTab(filename, filetype, content, false, null, true); // Pass true for isFromLocal
                    fileInput.value = null;
                };
                reader.readAsText(file);
            }
        });
    }

    if (saveFileBtn) { /* ... (same as before, also updates isUntitled) ... */ 
        saveFileBtn.addEventListener('click', () => {
            if (!activeTabId || !openTabs[activeTabId]) {
                alert("No active file to save!"); return;
            }
            const tabData = openTabs[activeTabId];
            // If it's still an "untitled-X" file, prompt for a name before saving
            if (tabData.isUntitled || tabData.filename.startsWith("untitled-")) {
                const newName = prompt("Save as:", tabData.filename);
                if (newName) {
                    // Check for duplicate filenames among open tabs
                    const isDuplicate = Object.values(openTabs).some(tab => tab.id !== activeTabId && tab.filename === newName);
                    if (isDuplicate) {
                        alert(`A file named "${newName}" is already open. Please save with a different name or close the existing one.`);
                        return;
                    }
                    tabData.filename = newName;
                    tabData.filetype = getDisplayFileType(newName);
                    tabData.isUntitled = false;
                } else {
                    return; // User cancelled save prompt
                }
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
            openTabs[activeTabId].content = content; // Update content after successful save
            if(languageStatus && activeTabId === tabId) languageStatus.textContent = tabData.filetype; // tabId not defined here
            if(languageStatus && openTabs[activeTabId]) languageStatus.textContent = openTabs[activeTabId].filetype;

            renderTabs(); // Update UI (removes dirty, updates name)
            console.log(`${filename} saved.`);
        });
    }
    document.addEventListener('keydown', function(e) { /* ... (save shortcut) ... */ 
        if ((e.ctrlKey || e.metaKey) && e.key === 's') {
            e.preventDefault();
            saveFileBtn.click();
        }
    });
    window.addEventListener('beforeunload', (event) => { /* ... (same as before) ... */ 
        if (activeTabId && openTabs[activeTabId] && editor && openTabs[activeTabId].isDirty) {
             openTabs[activeTabId].content = editor.getValue();
        }
        saveStateToLocalStorage();

        let hasUnsavedChanges = false;
        for (const id in openTabs) { if (openTabs[id].isDirty) { hasUnsavedChanges = true; break; } }
        if (hasUnsavedChanges) { event.preventDefault(); event.returnValue = ''; }
    });

    // --- Initial Load ---
    loadSidebarWidth(); // Load sidebar width first

    const stateLoaded = loadStateFromLocalStorage();
    if (stateLoaded) { // implies Object.keys(openTabs).length > 0 if true
        renderTabs(); // Render all tabs from LS
        let tabToActivate = activeTabId;
        if (!tabToActivate || !openTabs[tabToActivate]) {
            const sortedRestoredTabs = Object.values(openTabs).sort((a,b) => a.filename.localeCompare(b.filename));
            tabToActivate = sortedRestoredTabs.length > 0 ? sortedRestoredTabs[0].id : null;
        }
        if (tabToActivate) {
            switchToTab(tabToActivate);
        } else { // No valid tabs to activate from LS
            activeTabId = null; // Ensure consistency
            createNewUntitledFile(); // Open a fresh untitled tab
        }
    } else { // No localStorage state, or it was empty/corrupted
        openTabs = {}; activeTabId = null; nextTabIdCounter = 1; untitledFileCounter = 1; // Reset state
        createNewUntitledFile(); // Open a default blank tab
    }
});