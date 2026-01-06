import React, { useState, useRef, useEffect } from 'react';
import { Button } from './components/Button.tsx';
import { parseDocumentWithMistral, FileData } from './services/mistralService.ts';
import { Language, ParseResponse, DocNode } from './types.ts';
import { ToastProvider, useToast } from './components/ui/ToastContext';

const renderJsonWithAnchors = (obj: any, path: string = 'root'): string => {
  if (Array.isArray(obj)) {
    return `[\n${obj.map((item, i) => renderJsonWithAnchors(item, `${path}-${i}`)).join(',\n')}\n]`;
  } else if (typeof obj === 'object' && obj !== null) {
    const keys = Object.keys(obj);
    const content = keys.map(key => {
      const val = obj[key];
      const valStr = typeof val === 'object' ? renderJsonWithAnchors(val, `${path}-${key}`) : JSON.stringify(val);
      return `  "${key}": ${valStr}`;
    }).join(',\n');
    return `<span id="json-${path}" class="json-node-marker">{</span>\n${content}\n<span class="json-node-marker">}</span>`;
  }
  return JSON.stringify(obj);
};

interface TreeItemProps {
  node: DocNode;
  depth: number;
  path: string;
  onLocate: (path: string) => void;
}

const TreeItem: React.FC<TreeItemProps> = ({ node, depth, path, onLocate }) => {
  const [isOpen, setIsOpen] = useState(depth < 1);

  return (
    <div className="my-2 select-none">
      <div
        className={`group flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer shadow-sm
          ${isOpen ? 'bg-white border-indigo-200 ring-1 ring-indigo-50' : 'bg-slate-50 border-slate-200 hover:border-indigo-300 hover:bg-white'}
        `}
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="mt-0.5 shrink-0 flex flex-col gap-2">
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded bg-indigo-600 text-white text-[10px] font-bold tracking-tight shadow-sm uppercase">
            {node.index}
          </span>
          <button
            title="Locate in JSON"
            onClick={(e) => {
              e.stopPropagation();
              onLocate(path);
            }}
            className="p-1 rounded bg-slate-200 text-slate-500 hover:bg-indigo-600 hover:text-white transition-all shadow-inner"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
          </button>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`text-sm font-bold truncate transition-colors ${isOpen ? 'text-indigo-900' : 'text-slate-700'}`}>
              {node.title || "Section Content"}
            </h4>
            <svg
              className={`w-4 h-4 text-slate-400 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
              fill="none" viewBox="0 0 24 24" stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {!isOpen && node.text && (
            <p className="text-xs text-slate-500 truncate mt-0.5 italic">
              {node.text.substring(0, 100)}...
            </p>
          )}
        </div>
      </div>

      {isOpen && (
        <div className="ml-4 sm:ml-6 mt-2 pl-4 border-l-2 border-indigo-100 space-y-2 animate-in slide-in-from-top-2 fade-in duration-300">
          <div className="bg-white p-4 rounded-xl border border-slate-100 shadow-sm group relative">
            <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap font-sans">
              {node.text}
            </p>
          </div>

          {node.children && node.children.length > 0 && (
            <div className="pt-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] mb-2 ml-2">Nested Clauses</p>
              {node.children.map((child, idx) => (
                <TreeItem
                  key={`${child.index}-${idx}`}
                  node={child}
                  depth={depth + 1}
                  path={`${path}-children-${idx}`}
                  onLocate={onLocate}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface FileState {
  id: string; // Unique ID (e.g., filename + timestamp)
  file: File;
  status: 'pending' | 'processing' | 'success' | 'error';
  result?: DocNode[];
  errorMsg?: string;
  previewUrl?: string; // Cache preview URL
}

const RegulatoryParser: React.FC = () => {
  const { addToast, updateToast } = useToast();
  // State
  const [activeFileId, setActiveFileId] = useState<string | null>(null);
  const [filesData, setFilesData] = useState<FileState[]>([]);
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');
  const [viewMode, setViewMode] = useState<'raw' | 'tree'>('tree');
  const [pendingLocateId, setPendingLocateId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonContainerRef = useRef<HTMLDivElement>(null);

  // Helper: File to Base64
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  // Handle Drag & Drop / File Selection
  const handleFiles = (files: FileList | null) => {
    if (!files) return;
    const newFiles: FileState[] = [];
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

    Array.from(files).forEach(file => {
      if (!allowedTypes.includes(file.type)) {
        addToast(`Skipped ${file.name}: Invalid Type`, 'error');
        return;
      }
      const id = `${file.name}-${Date.now()}`;
      newFiles.push({
        id,
        file,
        status: 'pending',
        previewUrl: URL.createObjectURL(file)
      });
    });

    if (newFiles.length > 0) {
      setFilesData(prev => [...prev, ...newFiles]);
      if (!activeFileId) setActiveFileId(newFiles[0].id); // Auto-select first if none selected

      // Trigger Processing Immediately for new files? Or specific button?
      // User request implies "upload... toast for each". 
      // Let's create a separate function to process pending files so user gets feedback.
      // For now, we'll just add them.
    }
  };

  // Trigger processing for a specific file
  const processFile = async (fileState: FileState) => {
    const { id, file } = fileState;
    const toastId = addToast(`Starting parse for ${file.name}`, 'loading');

    // Update state to processing
    setFilesData(prev => prev.map(f => f.id === id ? { ...f, status: 'processing' } : f));

    try {
      const base64 = await fileToBase64(file);
      const fileData: FileData = {
        inlineData: { data: base64, mimeType: file.type }
      };

      // Perform Parsing
      const response: ParseResponse = await parseDocumentWithMistral(selectedLanguage, undefined, fileData);

      if (response.status === 'ERROR') {
        throw new Error(response.errorMessage || "Unknown parsing error");
      }

      setFilesData(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'success', result: response.document } : f
      ));
      updateToast(toastId, `Successfully parsed ${file.name}`, 'success');

    } catch (err: any) {
      console.error(err);
      setFilesData(prev => prev.map(f =>
        f.id === id ? { ...f, status: 'error', errorMsg: err.message } : f
      ));
      updateToast(toastId, `Failed to parse ${file.name}: ${err.message}`, 'error');
    }
  };

  const handleProcessAll = () => {
    filesData.filter(f => f.status === 'pending').forEach(fileState => {
      processFile(fileState);
    });
  };

  // Locate functionality for JSON view
  const handleLocate = (path: string) => {
    setPendingLocateId(path);
    setViewMode('raw');
  };

  useEffect(() => {
    if (viewMode === 'raw' && pendingLocateId) {
      const timer = setTimeout(() => {
        const element = document.getElementById(`json-${pendingLocateId}`);
        if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          element.classList.add('animate-pulse', 'bg-indigo-500/20');
          setTimeout(() => {
            element.classList.remove('animate-pulse', 'bg-indigo-500/20');
          }, 2000);
        }
        setPendingLocateId(null);
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [viewMode, pendingLocateId]);


  const activeFile = filesData.find(f => f.id === activeFileId);

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Logo */}
            <div className="bg-indigo-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">ReguParse <span className="text-indigo-600">AI</span></h1>
          </div>
          <div className="flex bg-slate-100 p-1 rounded-lg">
            {filesData.map(f => (
              <button
                key={f.id}
                onClick={() => setActiveFileId(f.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-2
                    ${activeFileId === f.id ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-700'}
                  `}
              >
                <span className={`w-2 h-2 rounded-full ${f.status === 'success' ? 'bg-green-500' :
                  f.status === 'error' ? 'bg-red-500' :
                    f.status === 'processing' ? 'bg-indigo-500 animate-pulse' :
                      'bg-slate-300'
                  }`}></span>
                {f.file.name.substring(0, 15)}...
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
        {/* Left Column: Input */}
        <section className="flex-1 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Documents</h2>
            <div className="flex gap-2">
              <div className="flex bg-slate-200 p-1 rounded-xl">
                <button onClick={() => setSelectedLanguage('en')} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${selectedLanguage === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>EN</button>
                <button onClick={() => setSelectedLanguage('ar')} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${selectedLanguage === 'ar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>AR</button>
              </div>
            </div>
          </div>

          <div className="p-5 flex flex-col gap-5 flex-1">
            {/* Upload Area */}
            <div
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all group min-h-[200px]
                   ${filesData.length === 0 ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200 hover:border-indigo-400 hover:bg-slate-50'}
                `}
            >
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                multiple
                onChange={(e) => handleFiles(e.target.files)}
                accept="application/pdf,image/*"
              />
              <div className="bg-indigo-100 text-indigo-600 p-4 rounded-xl mb-3 group-hover:scale-110 transition-transform">
                <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
              </div>
              <p className="font-bold text-slate-700 text-center">Click to Upload Documents</p>
              <p className="text-xs text-slate-400 mt-1">PDF, JPG, PNG supported</p>
            </div>

            {/* Active File Preview */}
            {activeFile && (
              <div className="flex flex-col gap-2 flex-1 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-500 uppercase">Previewing: {activeFile.file.name}</h3>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded uppercase ${activeFile.status === 'success' ? 'bg-green-100 text-green-700' :
                    activeFile.status === 'processing' ? 'bg-indigo-100 text-indigo-700' :
                      activeFile.status === 'error' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                    {activeFile.status}
                  </span>
                </div>
                <div className="flex-1 bg-slate-100 rounded-xl overflow-hidden border border-slate-200 relative min-h-[400px]">
                  {activeFile.file.type === 'application/pdf' ? (
                    <object data={activeFile.previewUrl} type="application/pdf" className="w-full h-full">
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/90">
                        <p className="text-slate-500 font-medium">Preview not available via object tag</p>
                        <Button variant="outline" size="sm" onClick={() => window.open(activeFile.previewUrl, '_blank')}>Open PDF</Button>
                      </div>
                    </object>
                  ) : (
                    <img src={activeFile.previewUrl} alt="Preview" className="w-full h-full object-contain" />
                  )}
                </div>
              </div>
            )}

            {filesData.some(f => f.status === 'pending') && (
              <Button onClick={handleProcessAll} className="w-full py-4 shadow-xl animate-bounce">
                Process Pending Files ({filesData.filter(f => f.status === 'pending').length})
              </Button>
            )}
          </div>
        </section>

        {/* Right Column: Output */}
        <section className="flex-1 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">
                {activeFile ? `Structure: ${activeFile.file.name}` : 'Structure Output'}
              </h2>
              {activeFile?.status === 'success' && (
                <div className="flex bg-slate-200 p-1 rounded-lg">
                  <button onClick={() => setViewMode('tree')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'tree' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>TREE</button>
                  <button onClick={() => setViewMode('raw')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'raw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>JSON</button>
                </div>
              )}
            </div>
            {activeFile?.status === 'success' && activeFile.result && (
              <button
                onClick={() => navigator.clipboard.writeText(JSON.stringify(activeFile.result, null, 2))}
                className="text-indigo-600 font-bold text-[10px] uppercase hover:underline"
              >
                Copy JSON
              </button>
            )}
          </div>

          <div className="flex-1 overflow-hidden relative bg-slate-50/30">
            {!activeFile ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                <p>Select a file to view results</p>
              </div>
            ) : activeFile.status === 'processing' ? (
              <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                <div className="w-16 h-16 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mb-4"></div>
                <p className="text-slate-600 font-medium animate-pulse">Analyzing Document...</p>
              </div>
            ) : activeFile.status === 'error' ? (
              <div className="h-full flex flex-col items-center justify-center p-10 text-center text-red-500">
                <svg className="w-12 h-12 mb-2" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="font-bold">Analysis Failed</p>
                <p className="text-sm mt-1 text-slate-500">{activeFile.errorMsg}</p>
              </div>
            ) : activeFile.status === 'success' && activeFile.result ? (
              <div className="h-full overflow-auto p-4">
                {viewMode === 'raw' ? (
                  <div ref={jsonContainerRef} className="h-full overflow-auto bg-slate-900 rounded-2xl shadow-inner p-6">
                    <pre
                      className="text-indigo-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{
                        __html: renderJsonWithAnchors(activeFile.result)
                      }}
                    />
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto pb-10">
                    {activeFile.result.map((node, index) => (
                      <TreeItem
                        key={`${node.index}-${index}`}
                        node={node}
                        depth={0}
                        path={`${index}`}
                        onLocate={handleLocate}
                      />
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 opacity-50">
                <p>Ready to Process</p>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <ToastProvider>
      <RegulatoryParser />
    </ToastProvider>
  );
};

export default App;
