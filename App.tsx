
import React, { useState, useRef, useEffect } from 'react';
import { Button } from './components/Button.tsx';
import { parseDocumentWithMistral, FileData } from './services/mistralService.ts';
import { ProcessingStatus, Language, ParseResponse, DocNode } from './types.ts';

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

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [selectedLanguage, setSelectedLanguage] = useState<Language>('en');
  const [selectedFile, setSelectedFile] = useState<{ file: File; base64: string; mimeType: string; previewUrl: string } | null>(null);
  const [result, setResult] = useState('');
  const [viewMode, setViewMode] = useState<'raw' | 'tree'>('tree');
  const [status, setStatus] = useState<ProcessingStatus>(ProcessingStatus.IDLE);
  const [loadingMsg, setLoadingMsg] = useState('Initializing Mistral...');
  const [error, setError] = useState<string | null>(null);
  const [pendingLocateId, setPendingLocateId] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const jsonContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    return () => {
      if (selectedFile?.previewUrl) URL.revokeObjectURL(selectedFile.previewUrl);
    };
  }, [selectedFile]);

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

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve((reader.result as string).split(',')[1]);
      reader.onerror = (error) => reject(error);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        setError("Please upload a PDF or high-resolution image.");
        return;
      }
      try {
        const base64 = await fileToBase64(file);
        const previewUrl = URL.createObjectURL(file);
        if (selectedFile?.previewUrl) URL.revokeObjectURL(selectedFile.previewUrl);
        setSelectedFile({ file, base64, mimeType: file.type, previewUrl });
        setError(null);
      } catch (err) {
        setError("Failed to process file.");
      }
    }
  };

  const handleProcess = async () => {
    if (!inputText.trim() && !selectedFile) return;
    setStatus(ProcessingStatus.LOADING);
    setLoadingMsg('Consulting Mistral Large...');
    setError(null);

    const msgTimer = setInterval(() => {
      const msgs = ['Analyzing with Mistral Large...', 'Building JSON tree...', 'Extracting clauses...', 'Structuring regulatory data...', 'Optimizing hierarchy...'];
      setLoadingMsg(msgs[Math.floor(Math.random() * msgs.length)]);
    }, 3000);

    try {
      const fileData: FileData | undefined = selectedFile ? {
        inlineData: { data: selectedFile.base64, mimeType: selectedFile.mimeType }
      } : undefined;

      const response: ParseResponse = await parseDocumentWithMistral(selectedLanguage, inputText, fileData);
      
      if (response.status === 'ERROR') {
        setError(response.errorMessage || "Unable to parse structure.");
        setStatus(ProcessingStatus.ERROR);
      } else {
        setResult(JSON.stringify(response.document, null, 2));
        setStatus(ProcessingStatus.SUCCESS);
        setViewMode('tree');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Parsing failed. Ensure your Mistral API Key is valid.");
      setStatus(ProcessingStatus.ERROR);
    } finally {
      clearInterval(msgTimer);
    }
  };

  const handleLocate = (path: string) => {
    setPendingLocateId(path);
    setViewMode('raw');
  };

  const parsedDocument: DocNode[] = result ? JSON.parse(result) : [];

  return (
    <div className="min-h-screen flex flex-col font-sans bg-slate-50">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-800">ReguParse <span className="text-indigo-600">AI</span></h1>
          </div>
          <div className="flex items-center gap-3">
            {status !== ProcessingStatus.IDLE && (
              <Button variant="outline" size="sm" onClick={() => {setResult(''); setStatus(ProcessingStatus.IDLE);}}>Reset</Button>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 sm:p-6 flex flex-col lg:flex-row gap-6">
        {/* Left Column: Input */}
        <section className="flex-1 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Source Document</h2>
            <div className="flex bg-slate-200 p-1 rounded-xl">
              <button onClick={() => setSelectedLanguage('en')} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${selectedLanguage === 'en' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>EN</button>
              <button onClick={() => setSelectedLanguage('ar')} className={`px-4 py-1.5 text-xs font-black rounded-lg transition-all ${selectedLanguage === 'ar' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>AR</button>
            </div>
          </div>
          
          <div className="p-5 flex flex-col gap-5 flex-1">
            {!selectedFile ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-slate-200 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer hover:border-indigo-400 hover:bg-indigo-50 transition-all group min-h-[300px]">
                <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileChange} accept="application/pdf,image/*" />
                <div className="bg-indigo-100 text-indigo-600 p-5 rounded-2xl mb-4 group-hover:scale-110 transition-transform"><svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg></div>
                <p className="font-bold text-slate-700 text-center">Upload PDF or Rulebook Image</p>
                <p className="text-xs text-slate-400 mt-2 text-center">Mistral Large will parse the hierarchy</p>
              </div>
            ) : (
              <div className="flex flex-col gap-4 flex-1">
                <div className="bg-indigo-50 p-4 rounded-2xl border border-indigo-100 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="bg-indigo-600 text-white p-2.5 rounded-xl shrink-0"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg></div>
                    <span className="text-sm font-bold text-indigo-900 truncate">{selectedFile.file.name}</span>
                  </div>
                  <button onClick={() => setSelectedFile(null)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg></button>
                </div>
                <div className="flex-1 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 relative min-h-[300px]">
                  {selectedFile.mimeType === 'application/pdf' ? (
                    <object data={selectedFile.previewUrl} type="application/pdf" className="w-full h-full">
                      <div className="absolute inset-0 flex flex-col items-center justify-center p-10 text-center bg-white/90">
                        <p className="text-amber-600 font-bold mb-2">Full document view</p>
                        <Button variant="outline" size="sm" onClick={() => window.open(selectedFile.previewUrl, '_blank')}>Popout View</Button>
                      </div>
                    </object>
                  ) : (
                    <img src={selectedFile.previewUrl} alt="Preview" className="w-full h-full object-contain" />
                  )}
                </div>
              </div>
            )}
            <Button onClick={handleProcess} isLoading={status === ProcessingStatus.LOADING} className="w-full py-4 shadow-xl">
              Parse Hierarchy (Mistral)
            </Button>
          </div>
        </section>

        {/* Right Column: Output */}
        <section className="flex-1 flex flex-col bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden">
          <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <h2 className="text-sm font-bold text-slate-700 uppercase tracking-widest">Extracted Structure</h2>
              {status === ProcessingStatus.SUCCESS && (
                <div className="flex bg-slate-200 p-1 rounded-lg">
                  <button onClick={() => setViewMode('tree')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'tree' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>TREE</button>
                  <button onClick={() => setViewMode('raw')} className={`px-3 py-1 text-[10px] font-black rounded-md transition-all ${viewMode === 'raw' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500'}`}>JSON</button>
                </div>
              )}
            </div>
            {status === ProcessingStatus.SUCCESS && (
              <button onClick={() => navigator.clipboard.writeText(result)} className="text-indigo-600 font-bold text-[10px] uppercase hover:underline flex items-center gap-1">
                Copy
              </button>
            )}
          </div>

          <div className="flex-1 overflow-hidden relative">
            {status === ProcessingStatus.IDLE && (
              <div className="h-full flex flex-col items-center justify-center p-10 text-center text-slate-400 opacity-50">
                <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>
                <p className="text-sm font-medium">Hierarchy will appear here after parsing</p>
              </div>
            )}

            {status === ProcessingStatus.LOADING && (
              <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                <div className="relative w-20 h-20 mb-6">
                  <div className="absolute inset-0 border-4 border-indigo-100 rounded-full"></div>
                  <div className="absolute inset-0 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                </div>
                <p className="text-lg font-bold text-slate-800 animate-pulse">{loadingMsg}</p>
              </div>
            )}

            {status === ProcessingStatus.ERROR && (
              <div className="h-full flex flex-col items-center justify-center p-10 text-center">
                <div className="bg-red-50 text-red-600 p-4 rounded-full mb-4"><svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg></div>
                <p className="text-sm font-bold text-red-700 max-w-sm">{error}</p>
                <Button variant="outline" size="sm" onClick={handleProcess} className="mt-6">Try Again</Button>
              </div>
            )}

            {status === ProcessingStatus.SUCCESS && (
              <div className="h-full overflow-auto p-4 bg-slate-50/30">
                {viewMode === 'raw' ? (
                  <div ref={jsonContainerRef} className="h-full overflow-auto bg-slate-900 rounded-2xl shadow-inner p-6">
                    <pre 
                      className="text-indigo-300 font-mono text-[10px] leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ 
                        __html: renderJsonWithAnchors(JSON.parse(result)) 
                      }}
                    />
                  </div>
                ) : (
                  <div className="max-w-3xl mx-auto pb-10">
                    {parsedDocument.map((node, index) => (
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
            )}
          </div>
        </section>
      </main>

      <footer className="p-4 bg-white border-t border-slate-200 text-center">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Precision Regulatory Parsing &bull; Mistral Large</p>
      </footer>
    </div>
  );
};

export default App;
