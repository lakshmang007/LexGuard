import { useState, useRef, useEffect } from 'react';
import { ref, uploadBytes } from "firebase/storage";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { storage, auth, googleProvider } from './firebase';
import { analyzeDocumentWithAI, analyzeFileWithAI, askLexGuardChatbot } from './services/ai';
import { 
  Shield, 
  Menu, 
  Search, 
  HelpCircle, 
  Bell, 
  LayoutDashboard, 
  Upload as UploadIcon, 
  FolderOpen, 
  Settings, 
  LogOut, 
  X, 
  Send, 
  MessageSquare,
  FileText,
  AlertTriangle,
  Info,
  CheckCircle2,
  MoreVertical,
  Plus
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import './index.css';

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

const DEMO_CONTRACT = `EMPLOYMENT AND CONFIDENTIALITY AGREEMENT

This Employment and Confidentiality Agreement ("Agreement") is made effective as of the date of electronic acceptance, by and between LexGuard Corp ("Company") and the Employee.

1. POSITION AND DUTIES
The Employee agrees to perform all duties assigned by the Company. The Company reserves the right to modify the Employee's job title, duties, and reporting structure at any time, without prior notice or consent.

2. AT-WILL EMPLOYMENT
Employment with the Company is "at-will." The Company may terminate the Employee's employment at any time, for any reason or no reason, with or without cause, and without prior notice.

3. NON-COMPETITION
During the term of employment and for a period of sixty (60) months following the termination of employment for any reason, the Employee shall not, directly or indirectly, engage in, consult for, or be employed by any business, enterprise, or entity that competes with the Company anywhere in the world.

4. INTELLECTUAL PROPERTY ASSIGNMENT
Any and all inventions, discoveries, software, artwork, writings, or other intellectual property ("IP") created by the Employee during the term of this Agreement, whether created during working hours or on personal time, and whether utilizing Company resources or personal resources, shall become the exclusive, perpetual, and royalty-free property of the Company.

5. ARBITRATION AND WAIVER OF JURY TRIAL
Any dispute arising out of or relating to this Agreement or the employment relationship shall be resolved by mandatory, binding arbitration conducted confidentially in the State of Delaware. The Employee expressly waives any right to bring a class action lawsuit or a trial by jury against the Company.`;

function App() {
  // Auth state
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // App state
  const [activeTab, setActiveTab] = useState("Home");
  const [fileName, setFileName] = useState(null);
  const [isScanning, setIsScanning] = useState(false);
  const [docText, setDocText] = useState("");
  const [insights, setInsights] = useState([]);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  
  // Settings State
  const [apiKeyInput, setApiKeyInput] = useState(() => localStorage.getItem("gemini_api_key") || "");

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);
  
  // Chatbot state
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState([
    { sender: 'bot', text: "Hello! I am the LexGuard Assistant. Ask me anything about your uploaded contract." }
  ]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const saveApiKey = () => {
    localStorage.setItem("gemini_api_key", apiKeyInput);
    // Google-style notification
    alert("Key saved");
  };

  const processTextWithAI = async (text, name) => {
    setFileName(name);
    setDocText(text);
    setIsScanning(true);
    setInsights([]);

    try {
      const analysisResults = await analyzeDocumentWithAI(text);
      setInsights(analysisResults);
    } catch (error) {
      console.error("Error processing document:", error);
    } finally {
      setIsScanning(false);
    }
  };

  const processFile = async (uploadedFile) => {
    if (!uploadedFile) return;

    setFileName(uploadedFile.name);
    setIsScanning(true);
    setInsights([]);

    // 1. Upload to Firebase (Optional/Background)
    const storagePath = user ? `contracts/${user.uid}/${uploadedFile.name}-${Date.now()}` : `contracts/anonymous/${uploadedFile.name}-${Date.now()}`;
    try {
      const storageRef = ref(storage, storagePath);
      uploadBytes(storageRef, uploadedFile).catch(e => console.warn("Firebase upload skipped:", e));
    } catch (fbError) {
      console.warn("Storage ref failed:", fbError);
    }
    
    try {
      if (uploadedFile.type === "application/pdf") {
        const report = await analyzeFileWithAI(uploadedFile);
        // Transform full report highRiskClauses into the format the UI expects for 'insights'
        if (report.highRiskClauses) {
          const transformedInsights = report.highRiskClauses.map((c, idx) => ({
            id: String(idx + 1),
            title: "High Risk Clause",
            extracted_text: c.clause,
            risk_score: 8, // Defaulting to high for highRiskClauses
            plain_language_explanation: c.plainEnglish + " - " + c.implication
          }));
          setInsights(transformedInsights);
          setDocText("Full PDF analysis complete. See intelligence recon for details. (Native PDF view currently unavailable)");
        } else if (Array.isArray(report)) {
          setInsights(report);
        }
      } else {
        // Handle as text
        const extractedText = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (event) => resolve(event.target.result);
          reader.onerror = (error) => reject(error);
          reader.readAsText(uploadedFile);
        });
        setDocText(extractedText);
        const analysisResults = await analyzeDocumentWithAI(extractedText);
        setInsights(analysisResults);
      }
    } catch (error) {
      console.error("Error processing file:", error);
      setInsights([{
        id: "error",
        title: "Analysis Failed",
        extracted_text: "Upload failed",
        risk_score: 10,
        plain_language_explanation: "LexGuard encountered an error analyzing this file: " + error.message
      }]);
    } finally {
      setIsScanning(false);
    }
  };

  const handleFileUpload = (e) => processFile(e.target.files[0]);
  const handleDragOver = (e) => { e.preventDefault(); setIsDragging(true); };
  const handleDragLeave = (e) => { e.preventDefault(); setIsDragging(false); };
  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  };

  const getRiskColor = (score) => {
    if (score >= 7) return 'text-google-red bg-google-red-container';
    if (score >= 4) return 'text-google-yellow-700 bg-google-yellow-container';
    return 'text-google-green bg-google-green-container';
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setChatHistory(prev => [...prev, { sender: 'user', text: userMsg }]);
    const reply = await askLexGuardChatbot(userMsg, docText);
    setChatHistory(prev => [...prev, { sender: 'bot', text: reply }]);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-surface-container-low">
        <div className="w-16 h-1 w-full max-w-[200px] overflow-hidden rounded-full linear-progress">
          <div className="linear-progress-bar" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface-container">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="m3-card p-12 max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-google-blue-container flex items-center justify-center text-google-blue">
              <Shield size={40} />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-medium tracking-tight">LexGuard</h1>
            <p className="text-on-surface-variant">Sign in to your Google Account to access the AI Contract Intelligence platform.</p>
          </div>
          <button 
            onClick={handleLogin}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 border border-outline rounded-full hover:bg-surface-container transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 48 48">
              <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
              <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
              <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
              <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
            </svg>
            <span className="font-medium">Sign in with Google</span>
          </button>
          <button 
            onClick={() => setUser({ uid: 'demo', displayName: 'Demo User', photoURL: 'https://ui-avatars.com/api/?name=Demo+User&background=1A73E8&color=fff' })}
            className="text-sm text-google-blue hover:underline"
          >
            Bypass for Testing
          </button>
        </motion.div>
      </div>
    );
  }

  const navItems = [
    { id: 'Home', icon: Shield },
    { id: 'Dashboard', icon: LayoutDashboard },
    { id: 'Upload', icon: UploadIcon },
    { id: 'History', icon: FolderOpen },
    { id: 'Settings', icon: Settings },
  ];

  return (
    <div className="flex flex-col h-screen bg-surface-container-low">
      {/* Top App Bar */}
      <header className="h-16 flex items-center justify-between px-4 bg-surface-container-low border-b border-outline z-30">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            className="p-2 rounded-full hover:bg-surface-container-high transition-colors text-on-surface-variant"
          >
            <Menu size={24} />
          </button>
          <div className="flex items-center gap-2">
            <Shield className="text-google-blue" size={28} />
            <h1 className="text-xl font-medium tracking-tight text-on-surface">LexGuard</h1>
          </div>
        </div>

        <div className="flex-1 max-w-2xl px-8 hidden md:block">
          <div className="flex items-center gap-3 px-4 py-2 bg-surface-container-high rounded-full text-on-surface-variant focus-within:bg-surface focus-within:shadow-md transition-all">
            <Search size={20} />
            <input 
              type="text" 
              placeholder="Search contracts and insights" 
              className="bg-transparent border-none outline-none w-full text-sm"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"><HelpCircle size={22} /></button>
          <button className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant relative">
            <Bell size={22} />
            <span className="absolute top-2 right-2 w-2 h-2 bg-google-red rounded-full border-2 border-surface"></span>
          </button>
          <div className="ml-2 pl-2 border-l border-outline flex items-center gap-3">
            <img 
              src={user.photoURL} 
              alt="Profile" 
              className="w-8 h-8 rounded-full border border-outline"
            />
            <button onClick={handleLogout} className="p-2 rounded-full hover:bg-surface-container-high text-on-surface-variant"><LogOut size={20} /></button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <aside 
          className={cn(
            "h-full bg-surface-container-low border-r border-outline flex flex-col py-4 transition-all duration-300",
            isSidebarCollapsed ? "w-20" : "w-64"
          )}
        >
          <nav className="flex-1 px-3 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex items-center gap-4 w-full p-4 rounded-full transition-all duration-200",
                  activeTab === item.id 
                    ? "bg-google-blue-container text-google-blue font-medium" 
                    : "text-on-surface-variant hover:bg-surface-container-high"
                )}
              >
                <item.icon size={24} />
                {!isSidebarCollapsed && <span>{item.id}</span>}
              </button>
            ))}
          </nav>
          
          {!isSidebarCollapsed && (
            <div className="mx-4 p-4 rounded-2xl bg-surface-container-high space-y-2">
              <p className="text-xs font-medium uppercase tracking-wider text-on-surface-variant">Model Integrity</p>
              <div className="flex items-center justify-between">
                <span className="text-xs text-on-surface-variant">Gemini 1.5 Series</span>
                <span className="w-2 h-2 rounded-full bg-google-green"></span>
              </div>
            </div>
          )}
        </aside>

        {/* Main Workspace */}
        <main className="flex-1 overflow-auto relative">
          {isScanning && <div className="absolute top-0 left-0 w-full linear-progress z-50"><div className="linear-progress-bar" /></div>}
          
          <div className="max-w-6xl mx-auto p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'Home' && (
                <motion.div 
                  key="home"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-12 py-8"
                >
                  <div className="text-center space-y-4">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-google-blue-container text-google-blue text-sm font-medium">
                      <Shield size={16} />
                      AI-Powered Legal Intelligence
                    </div>
                    <h2 className="text-5xl font-medium tracking-tight text-on-surface">LexGuard</h2>
                    <p className="text-xl text-on-surface-variant max-w-2xl mx-auto leading-relaxed">
                      Transforming complex legal jargon into actionable intelligence. Protect your IP, rights, and interests before you sign.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="m3-card p-8 space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-google-blue-container flex items-center justify-center text-google-blue">
                        <Info size={24} />
                      </div>
                      <h3 className="text-xl font-medium">What is LexGuard?</h3>
                      <p className="text-on-surface-variant leading-relaxed">
                        LexGuard is a high-end Digital Rights Management and Contract Analysis platform designed for developers, creators, and professionals. We bridge the gap between dense legal text and human understanding.
                      </p>
                    </div>

                    <div className="m3-card p-8 space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-google-green-container flex items-center justify-center text-google-green">
                        <CheckCircle2 size={24} />
                      </div>
                      <h3 className="text-xl font-medium">What it does</h3>
                      <p className="text-on-surface-variant leading-relaxed">
                        It automatically scans legal documents (like Employment Agreements, Terms of Service, or NDAs) to detect high-risk clauses, broad IP transfers, and hidden liabilities that often go unnoticed during standard review.
                      </p>
                    </div>

                    <div className="m3-card p-8 space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-google-yellow-container flex items-center justify-center text-google-yellow-700">
                        <Settings size={24} />
                      </div>
                      <h3 className="text-xl font-medium">How it works</h3>
                      <p className="text-on-surface-variant leading-relaxed">
                        Powered by Google's Gemini 1.5 Pro, our system parses your document in real-time, performing semantic analysis to categorize risks. We use sophisticated OCR and text processing to ensure no clause is missed, no matter how deeply buried.
                      </p>
                    </div>

                    <div className="m3-card p-8 space-y-4">
                      <div className="w-12 h-12 rounded-xl bg-google-red-container flex items-center justify-center text-google-red">
                        <Plus size={24} />
                      </div>
                      <h3 className="text-xl font-medium">What it provides</h3>
                      <p className="text-on-surface-variant leading-relaxed">
                        You'll receive a detailed intelligence report including risk severity scores (1-10), plain-language summaries of complex terms, and a dedicated AI legal assistant to answer specific questions about your agreement.
                      </p>
                    </div>
                  </div>

                  <div className="bg-surface-container rounded-3xl p-12 text-center space-y-6">
                    <h3 className="text-2xl font-medium italic">"Sign with confidence, not just compliance."</h3>
                    <div className="flex justify-center gap-4">
                      <button 
                        onClick={() => setActiveTab('Upload')}
                        className="px-10 py-4 bg-google-blue text-white rounded-full font-medium text-lg hover:shadow-lg transition-all"
                      >
                        Start First Analysis
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'Dashboard' && (
                <motion.div 
                  key="dashboard"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="space-y-8"
                >
                  <div className="space-y-2">
                    <h2 className="text-3xl font-medium tracking-tight">Intelligence Dashboard</h2>
                    <p className="text-on-surface-variant">Welcome back, {user.displayName}. Here's your legal risk overview.</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="m3-card p-6 bg-google-blue-container/30 border-google-blue/30 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-google-blue-container flex items-center justify-center text-google-blue">
                          <LayoutDashboard size={20} />
                        </div>
                        <MoreVertical size={20} className="text-on-surface-variant" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-4xl font-semibold">12</p>
                        <p className="text-sm text-on-surface-variant">Contracts Analyzed</p>
                      </div>
                    </div>
                    <div className="m3-card p-6 bg-google-red-container/30 border-google-red/30 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-google-red-container flex items-center justify-center text-google-red">
                          <AlertTriangle size={20} />
                        </div>
                        <MoreVertical size={20} className="text-on-surface-variant" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-4xl font-semibold">4</p>
                        <p className="text-sm text-on-surface-variant">High Risks Identified</p>
                      </div>
                    </div>
                    <div className="m3-card p-6 bg-google-green-container/30 border-google-green/30 space-y-4">
                      <div className="flex items-center justify-between">
                        <div className="w-10 h-10 rounded-full bg-google-green-container flex items-center justify-center text-google-green">
                          <CheckCircle2 size={20} />
                        </div>
                        <MoreVertical size={20} className="text-on-surface-variant" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-4xl font-semibold">92%</p>
                        <p className="text-sm text-on-surface-variant">Compliance Score</p>
                      </div>
                    </div>
                  </div>

                  <div className="m3-card p-12 text-center text-on-surface-variant space-y-6">
                    <div className="flex justify-center">
                      <div className="w-48 h-48 bg-surface-container flex items-center justify-center rounded-3xl border border-dashed border-outline">
                        <FileText size={48} className="opacity-20" />
                      </div>
                    </div>
                    <div className="max-w-md mx-auto space-y-2">
                       <h3 className="text-lg font-medium text-on-surface">No active analysis</h3>
                       <p>Start by uploading a contract to get real-time AI insights and risk scoring.</p>
                    </div>
                    <button 
                      onClick={() => setActiveTab('Upload')}
                      className="px-8 py-3 bg-google-blue text-white rounded-full font-medium hover:bg-google-blue-hover transition-all inline-flex items-center gap-2"
                    >
                      <Plus size={20} />
                      Analyze New Contract
                    </button>
                  </div>
                </motion.div>
              )}

              {activeTab === 'Settings' && (
                <motion.div 
                  key="settings"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-xl mx-auto space-y-8"
                >
                  <div className="space-y-2">
                    <h2 className="text-2xl font-medium">Platform Settings</h2>
                    <p className="text-on-surface-variant">Configure your LexGuard AI integrations and preferences.</p>
                  </div>
                  
                  <div className="m3-card p-6 space-y-6">
                    <div className="space-y-4">
                      <label className="block text-sm font-medium text-on-surface-variant uppercase tracking-wider">Google Gemini API Key</label>
                      <div className="flex gap-3">
                        <input 
                          type="password" 
                          value={apiKeyInput}
                          onChange={(e) => setApiKeyInput(e.target.value)}
                          placeholder="AIzaSy..."
                          className="flex-1 bg-surface-container-low border border-outline rounded-xl px-4 py-3 outline-none focus:border-google-blue transition-colors"
                        />
                        <button 
                          onClick={saveApiKey}
                          className="px-6 py-3 bg-google-blue text-white rounded-xl font-medium hover:bg-google-blue-hover transition-colors"
                        >
                          Save
                        </button>
                      </div>
                      <div className="p-4 bg-surface-container-high rounded-xl flex items-start gap-3">
                        <Info size={20} className="text-google-blue mt-0.5 shrink-0" />
                        <p className="text-sm text-on-surface-variant leading-relaxed">
                          Your key is stored securely in your browser's local storage and used only for direct API requests.
                        </p>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'History' && (
                <div className="text-center py-24 space-y-4">
                  <FolderOpen size={64} className="mx-auto text-outline" />
                  <h3 className="text-xl font-medium">History Module</h3>
                  <p className="text-on-surface-variant">Your analyzed contracts will appear here once saved to the database.</p>
                </div>
              )}

              {activeTab === 'Upload' && !fileName && (
                <motion.div 
                  key="upload"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="max-w-3xl mx-auto space-y-8 py-12"
                >
                  <div className="text-center space-y-2">
                    <h2 className="text-2xl font-medium">New Contract Analysis</h2>
                    <p className="text-on-surface-variant">Upload your agreement to identify hidden risks and exploitative clauses.</p>
                  </div>

                  <div 
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current.click()}
                    className={cn(
                      "m3-card p-16 flex flex-col items-center justify-center gap-6 cursor-pointer border-2 border-dashed transition-all",
                      isDragging ? "bg-google-blue-container border-google-blue scale-102" : "border-outline hover:bg-surface-container-low"
                    )}
                  >
                    <input type="file" ref={fileInputRef} className="hidden" accept=".pdf,.txt" onChange={handleFileUpload} />
                    <div className="w-20 h-20 rounded-full bg-surface-container flex items-center justify-center text-on-surface-variant">
                      <UploadIcon size={32} />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-medium">Click or drag to upload contract</p>
                      <p className="text-sm text-on-surface-variant mt-1">Supports text-based PDF and TXT files</p>
                    </div>
                    <div className="flex gap-4">
                       <button className="px-6 py-2 bg-google-blue text-white rounded-full text-sm font-medium">Browse Files</button>
                       <button 
                          onClick={(e) => { e.stopPropagation(); processTextWithAI(DEMO_CONTRACT, "employment_agreement.txt"); }}
                          className="px-6 py-2 border border-outline rounded-full text-sm font-medium hover:bg-surface-container"
                        >
                          Use Demo
                        </button>
                    </div>
                  </div>
                </motion.div>
              )}

              {fileName && (
                <motion.div 
                  key="analysis"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-8"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <button onClick={() => setFileName(null)} className="p-2 rounded-full hover:bg-surface-container-high transition-colors"><X size={20}/></button>
                      <div>
                        <div className="flex items-center gap-2">
                          <FileText size={18} className="text-on-surface-variant"/>
                          <h2 className="text-xl font-medium">{fileName}</h2>
                        </div>
                        <p className="text-xs text-on-surface-variant mt-1 flex items-center gap-1">
                          <CheckCircle2 size={12} className="text-google-green" /> Masking and AI processing active
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button className="px-5 py-2 border border-outline rounded-full text-sm font-medium hover:bg-surface-container">Download Report</button>
                      <button className="px-5 py-2 bg-google-blue text-white rounded-full text-sm font-medium">Save to Database</button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-8 h-[calc(100vh-280px)]">
                    {/* Split View: Left (Original Document) */}
                    <div className="m3-card bg-surface-container border-outline shadow-inner relative flex flex-col">
                      <div className="p-4 bg-surface border-b border-outline flex items-center justify-between">
                        <span className="text-xs font-medium text-on-surface-variant uppercase tracking-wider">Source Content</span>
                        <div className="flex gap-2">
                           <button className="p-1.5 rounded-md hover:bg-surface-container text-on-surface-variant"><Search size={16}/></button>
                           <button className="p-1.5 rounded-md hover:bg-surface-container text-on-surface-variant"><Settings size={16}/></button>
                        </div>
                      </div>
                      <div className="flex-1 p-12 overflow-auto bg-surface-container">
                        <div className="m3-card-elevated max-w-2xl mx-auto bg-white p-16 font-serif text-lg leading-relaxed shadow-xl text-on-surface transition-all whitespace-pre-wrap">
                          {docText}
                        </div>
                      </div>
                    </div>

                    {/* Split View: Right (AI Intelligence) */}
                    <div className="flex flex-col gap-6 overflow-hidden">
                       <h3 className="text-sm font-medium uppercase tracking-widest text-on-surface-variant">Intelligence Recon</h3>
                       <div className="flex-1 overflow-auto space-y-4 pr-4">
                          {isScanning ? (
                            Array.from({ length: 3 }).map((_, i) => (
                              <div key={i} className="m3-card p-6 animate-pulse space-y-4">
                                <div className="h-4 bg-surface-container-highest rounded w-3/4"></div>
                                <div className="h-20 bg-surface-container rounded"></div>
                              </div>
                            ))
                          ) : (
                            insights.map((insight) => (
                              <motion.div 
                                key={insight.id} 
                                initial={{ x: 20, opacity: 0 }}
                                animate={{ x: 0, opacity: 1 }}
                                className={cn("m3-card-elevated p-6 border-l-4", 
                                  insight.risk_score >= 7 ? "border-google-red" : 
                                  insight.risk_score >= 4 ? "border-google-yellow" : 
                                  "border-google-green"
                                )}
                              >
                                <div className="flex justify-between items-start mb-4">
                                  <h4 className="font-semibold text-lg">{insight.title}</h4>
                                  <span className={cn("px-2 py-0.5 rounded-full text-[10px] font-bold uppercase", getRiskColor(insight.risk_score))}>
                                    Score: {insight.risk_score}/10
                                  </span>
                                </div>
                                <p className="text-sm text-on-surface leading-relaxed mb-4">{insight.plain_language_explanation}</p>
                                <div className="p-3 bg-surface-container-low rounded-lg text-xs italic text-on-surface-variant border border-outline">
                                  "{insight.extracted_text}"
                                </div>
                              </motion.div>
                            ))
                          )}
                       </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Floating Action Button (FAB) */}
          <button 
            onClick={() => setActiveTab('Upload')}
            className="fixed bottom-8 right-8 w-14 h-14 bg-google-blue-container text-google-blue rounded-2xl shadow-xl hover:shadow-2xl hover:scale-105 transition-all flex items-center justify-center z-40"
            title="Analyze New Contract"
          >
             <Plus size={32} />
          </button>
        </main>
      </div>

      {/* Floating Chat Interface */}
      <AnimatePresence>
        {isChatOpen && (
          <motion.div 
            initial={{ opacity: 0, y: 100, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.9 }}
            className="fixed bottom-24 right-8 w-96 h-[500px] m3-card-elevated flex flex-col z-50 overflow-hidden"
          >
            <div className="p-4 bg-google-blue text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare size={18} />
                <span className="font-medium">LexGuard Assistant</span>
              </div>
              <button onClick={() => setIsChatOpen(false)} className="p-1 hover:bg-white/20 rounded-full transition-colors"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-auto p-4 bg-surface-container-low flex flex-col gap-4">
              {chatHistory.map((msg, i) => (
                <div 
                  key={i} 
                  className={cn(
                    "max-w-[85%] p-3 text-sm rounded-2xl",
                    msg.sender === 'bot' 
                      ? "bg-surface border border-outline self-start rounded-bl-sm" 
                      : "bg-google-blue-container text-google-blue self-end rounded-br-sm"
                  )}
                >
                  {msg.text}
                </div>
              ))}
            </div>
            <div className="p-4 border-t border-outline flex gap-2">
              <input 
                type="text" 
                placeholder="Ask a question..." 
                value={chatInput} 
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                className="flex-1 bg-surface-container rounded-full px-4 outline-none text-sm border focus:border-google-blue transition-colors"
              />
              <button 
                onClick={sendChatMessage}
                className="w-10 h-10 rounded-full bg-google-blue text-white flex items-center justify-center"
              >
                <Send size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Trigger FAB */}
      {fileName && (
        <button 
          onClick={() => setIsChatOpen(!isChatOpen)}
          className={cn(
            "fixed bottom-28 right-8 w-14 h-14 rounded-2xl shadow-xl transition-all flex items-center justify-center z-40",
            isChatOpen ? "bg-on-surface text-surface" : "bg-google-blue text-white"
          )}
        >
          <MessageSquare size={24} />
        </button>
      )}

      {/* System Status Snackbars Area */}
      <div className="fixed bottom-6 left-6 z-50 flex flex-col gap-3">
        {/* Placeholder for toasts */}
      </div>
    </div>
  );
}

export default App;
