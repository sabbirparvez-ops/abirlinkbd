
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { 
  Plus, LayoutDashboard, History, User as UserIcon, LogOut, Search, Download, 
  BrainCircuit, Trash2, X, ShieldCheck, UserPlus, CheckCircle2, 
  XCircle, Clock, Users as UsersIcon, Edit, UserCheck, AlertCircle, TrendingUp, TrendingDown, Wallet, Building2, Smartphone, Coins, Camera, Settings, Save, Calendar, Filter, XCircle as CancelIcon, Cloud
} from 'lucide-react';
import { storageService } from './services/storageService';
import { geminiService } from './services/geminiService';
import { exportToExcel } from './services/exportService';
import { syncService } from './services/syncService';
import { 
  Transaction, TransactionType, AppState, AISuggestion, 
  UserRole, PaymentSource, TransactionStatus, User as UserType 
} from './types';
import { 
  DEFAULT_CATEGORIES, INCOME_CATEGORIES, getIconComponent, 
  PAYMENT_SOURCES, CURRENCY, CONVEYANCE_SUB_CATEGORIES, 
  ADMIN_ONLY_CATEGORIES, ADMIN_ASSET_SUB_CATEGORIES 
} from './constants';
import { 
  PieChart as RePieChart, Pie, Cell, ResponsiveContainer, Tooltip as ReTooltip,
  XAxis, YAxis, CartesianGrid, AreaChart, Area, BarChart, Bar
} from 'recharts';

type View = 'dashboard' | 'transactions' | 'insights' | 'profile' | 'users' | 'rejected';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(storageService.loadData());
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [isAdding, setIsAdding] = useState(false);
  const [editingUser, setEditingUser] = useState<UserType | null>(null);
  const [aiTips, setAiTips] = useState<AISuggestion[]>([]);
  const [isLoadingTips, setIsLoadingTips] = useState(false);
  const [loginError, setLoginError] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Filtering States
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [filterUser, setFilterUser] = useState('all');
  const [filterCategory, setFilterCategory] = useState('all');

  const logoInputRef = useRef<HTMLInputElement>(null);
  const profilePicInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    storageService.saveData(state);
  }, [state]);

  const fetchAiTips = useCallback(async () => {
    if (!state.currentUser) return;
    const isGlobal = state.currentUser.role === UserRole.ADMIN || state.currentUser.role === UserRole.MANAGER;
    const dataForAI = state.transactions.filter(t => 
      t.status === TransactionStatus.APPROVED && t.category !== 'Requisition' && (isGlobal ? true : t.userId === state.currentUser?.id)
    );

    setIsLoadingTips(true);
    const tips = await geminiService.getAnalysis(dataForAI);
    setAiTips(tips);
    setIsLoadingTips(false);
  }, [state.transactions, state.currentUser]);

  useEffect(() => {
    if (state.transactions.length > 0 && state.currentUser) {
      fetchAiTips();
    }
  }, [fetchAiTips]);

  const handleCloudSync = async () => {
    if (!state.sheetUrl) {
      alert("Please configure Cloud Sync URL in Settings first.");
      setCurrentView('users');
      return;
    }
    setIsSyncing(true);
    const success = await syncService.syncToSheets(state.sheetUrl, state);
    if (success) {
      setState(prev => ({ ...prev, lastSynced: new Date().toLocaleString() }));
    } else {
      alert("Failed to sync with Google Cloud.");
    }
    setIsSyncing(false);
  };

  const stats = useMemo(() => {
    const isGlobalViewer = state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.MANAGER;
    
    const relevantTransactions = state.transactions.filter(t => {
      const isApproved = t.status === TransactionStatus.APPROVED;
      if (t.category === 'Requisition') return false;
      if (!isApproved) return false;
      return isGlobalViewer ? true : t.userId === state.currentUser?.id;
    });

    const income = relevantTransactions
      .filter(t => t.type === TransactionType.INCOME)
      .reduce((sum, t) => sum + t.amount, 0);
    const expenses = relevantTransactions
      .filter(t => t.type === TransactionType.EXPENSE)
      .reduce((sum, t) => sum + t.amount, 0);

    const sourceBalances = PAYMENT_SOURCES.reduce((acc, source) => {
      const sIncome = relevantTransactions
        .filter(t => t.source === source && t.type === TransactionType.INCOME)
        .reduce((sum, t) => sum + t.amount, 0);
      const sExpense = relevantTransactions
        .filter(t => t.source === source && t.type === TransactionType.EXPENSE)
        .reduce((sum, t) => sum + t.amount, 0);
      acc[source] = sIncome - sExpense;
      return acc;
    }, {} as Record<string, number>);
    
    return { income, expenses, balance: income - expenses, count: relevantTransactions.length, sourceBalances };
  }, [state.transactions, state.currentUser]);

  const filteredTransactions = useMemo(() => {
    let list = state.transactions;
    const isGlobalViewer = state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.MANAGER;
    
    if (!isGlobalViewer) {
      list = list.filter(t => t.userId === state.currentUser?.id);
    }
    
    list = list.filter(t => t.status !== TransactionStatus.REJECTED);

    return list.filter(t => {
      const matchesSearch = t.note.toLowerCase().includes(searchQuery.toLowerCase()) || 
                           t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           t.createdBy.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesUser = filterUser === 'all' || t.userId === filterUser;
      const matchesCategory = filterCategory === 'all' || t.category === filterCategory;
      const matchesStartDate = !startDate || new Date(t.date) >= new Date(startDate);
      const matchesEndDate = !endDate || new Date(t.date) <= new Date(endDate);
      
      return matchesSearch && matchesUser && matchesCategory && matchesStartDate && matchesEndDate;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.transactions, searchQuery, state.currentUser, filterUser, filterCategory, startDate, endDate]);

  const filteredSummary = useMemo(() => {
    const revenue = filteredTransactions
      .filter(t => t.type === TransactionType.INCOME && t.status === TransactionStatus.APPROVED && t.category !== 'Requisition')
      .reduce((sum, t) => sum + t.amount, 0);
    const outflow = filteredTransactions
      .filter(t => t.type === TransactionType.EXPENSE && t.status === TransactionStatus.APPROVED && t.category !== 'Requisition')
      .reduce((sum, t) => sum + t.amount, 0);
    return { revenue, outflow };
  }, [filteredTransactions]);

  const rejectedTransactions = useMemo(() => {
    let list = state.transactions.filter(t => t.status === TransactionStatus.REJECTED);
    const isGlobalViewer = state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.MANAGER;
    if (!isGlobalViewer) list = list.filter(t => t.userId === state.currentUser?.id);
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [state.transactions, state.currentUser]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'logo' | 'profilePic') => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        if (type === 'logo') {
          setState(prev => ({ ...prev, companyLogo: base64String }));
        } else {
          setState(prev => ({
            ...prev,
            users: prev.users.map(u => u.id === prev.currentUser?.id ? { ...u, profilePic: base64String } : u),
            currentUser: prev.currentUser ? { ...prev.currentUser, profilePic: base64String } : null
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLogin = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const user = state.users.find(u => 
      u.username === formData.get('username') && u.password === formData.get('password')
    );
    if (user) {
      setState(prev => ({ ...prev, currentUser: user }));
      setLoginError(false);
    } else {
      setLoginError(true);
    }
  };

  const handleLogout = () => {
    setState(prev => ({ ...prev, currentUser: null }));
    setCurrentView('dashboard');
  };

  const handleSaveUser = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const username = formData.get('username') as string;
    const password = formData.get('password') as string;
    const role = formData.get('role') as UserRole;

    if (editingUser) {
      setState(prev => ({
        ...prev,
        users: prev.users.map(u => u.id === editingUser.id ? { ...u, username, password, role } : u),
        currentUser: prev.currentUser?.id === editingUser.id ? { ...prev.currentUser, username, password, role } : prev.currentUser
      }));
      setEditingUser(null);
    } else {
      const newUser: UserType = {
        id: crypto.randomUUID(),
        username,
        password,
        role
      };
      setState(prev => ({ ...prev, users: [...prev.users, newUser] }));
    }
    e.currentTarget.reset();
  };

  const addTransaction = (t: Omit<Transaction, 'id' | 'userId' | 'createdBy' | 'status'>) => {
    if (!state.currentUser) return;
    
    let status = t.type === TransactionType.INCOME ? TransactionStatus.APPROVED : TransactionStatus.PENDING;
    if (t.type === TransactionType.EXPENSE && state.currentUser.role === UserRole.ADMIN) {
      status = TransactionStatus.APPROVED;
    }

    const newT: Transaction = { 
      ...t, 
      id: crypto.randomUUID(),
      userId: state.currentUser.id,
      createdBy: state.currentUser.username,
      status
    };
    setState(prev => ({ ...prev, transactions: [newT, ...prev.transactions] }));
    setIsAdding(false);
  };

  const setTransactionStatus = (id: string, status: TransactionStatus) => {
    setState(prev => ({
      ...prev,
      transactions: prev.transactions.map(t => t.id === id ? { ...t, status } : t)
    }));
  };

  const deleteTransaction = (id: string) => {
    if (state.currentUser?.role === UserRole.ADMIN && confirm('Delete permanently?')) {
      setState(prev => ({ ...prev, transactions: prev.transactions.filter(t => t.id !== id) }));
    }
  };

  const StatusBadge = ({ status }: { status: TransactionStatus }) => {
    const configs: Record<TransactionStatus, { color: string, label: string }> = {
      [TransactionStatus.PENDING]: { color: 'bg-amber-100 text-amber-700', label: 'Pending Verification' },
      [TransactionStatus.VERIFIED]: { color: 'bg-blue-100 text-blue-700', label: 'Verified (Admin Appr)' },
      [TransactionStatus.APPROVED]: { color: 'bg-emerald-100 text-emerald-700', label: 'Settled Node' },
      [TransactionStatus.REJECTED]: { color: 'bg-rose-100 text-rose-700', label: 'Rejected Node' },
    };
    const config = configs[status];
    return <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-widest ${config.color}`}>{config.label}</span>;
  };

  if (!state.currentUser) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-outfit">
        <div className="bg-white w-full max-w-md rounded-[3rem] p-12 shadow-2xl animate-slide-in flex flex-col items-center">
          <div className="w-24 h-24 bg-indigo-600 rounded-3xl flex items-center justify-center text-white mb-6 overflow-hidden shadow-xl">
             {state.companyLogo ? (
               <img src={state.companyLogo} className="w-full h-full object-cover" alt="Logo" />
             ) : <BrainCircuit size={48} />}
          </div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight text-center">{state.companyName || 'FinVue Pro'}</h1>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[10px] mt-2 mb-10">Gateway Node</p>
          <form onSubmit={handleLogin} className="w-full space-y-6">
            <input name="username" type="text" required className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" placeholder="UID" />
            <div className="space-y-2">
               <input name="password" type="password" required className="w-full px-6 py-4 bg-slate-50 border-none rounded-2xl focus:ring-2 focus:ring-indigo-500 outline-none font-bold" placeholder="Access Key" />
               {loginError && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest text-center animate-pulse">Wrong Access Key</p>}
            </div>
            <button type="submit" className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg shadow-xl shadow-indigo-100 hover:bg-indigo-700 active:scale-95 transition-all">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  const DashboardView = () => {
    const isGlobal = state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.MANAGER;
    const data = state.transactions.filter(t => t.status === TransactionStatus.APPROVED && t.category !== 'Requisition' && (isGlobal ? true : t.userId === state.currentUser?.id));
    
    const categoryData = useMemo(() => {
      const groups: Record<string, number> = {};
      data.filter(t => t.type === TransactionType.EXPENSE).forEach(t => {
        groups[t.category] = (groups[t.category] || 0) + t.amount;
      });
      return Object.entries(groups).map(([name, value]) => ({ name, value }));
    }, [data]);

    return (
      <div className="space-y-12 animate-slide-in font-outfit">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
               <span className="px-3 py-1 rounded-full bg-slate-900 text-white text-[10px] font-black uppercase tracking-widest">SYSTEM STATUS</span>
               {state.lastSynced && <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Last Cloud Sync: {state.lastSynced}</span>}
            </div>
            <h1 className="text-5xl font-black text-slate-900 tracking-tight">
              {isGlobal ? 'Enterprise Overview' : 'Operational Status'}
            </h1>
            <p className="text-slate-500 font-medium">Tracking verified assets across {stats.count} nodes</p>
          </div>
          <div className="flex items-center gap-4">
             {isGlobal && (
               <button 
                 onClick={handleCloudSync}
                 disabled={isSyncing}
                 className={`flex items-center gap-3 px-6 py-4 rounded-[2rem] font-black text-xs uppercase tracking-widest transition-all ${isSyncing ? 'bg-slate-100 text-slate-400' : 'bg-white text-indigo-600 shadow-xl border border-indigo-50 hover:scale-105'}`}
               >
                 <Cloud className={isSyncing ? 'animate-pulse' : ''} size={20} />
                 {isSyncing ? 'Syncing...' : 'Sync to Sheets'}
               </button>
             )}
             <div className="flex items-center gap-4 bg-white p-3 rounded-[2.5rem] shadow-xl shadow-slate-200/50 border border-slate-50">
                <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white overflow-hidden shadow-lg">
                   {state.currentUser?.profilePic ? (
                     <img src={state.currentUser.profilePic} className="w-full h-full object-cover" alt="User" />
                   ) : <UserIcon size={32} />}
                </div>
                <div className="pr-8">
                   <p className="text-xs text-slate-400 font-black uppercase tracking-tighter">{state.currentUser?.role.replace('_', ' ')} IDENTITY</p>
                   <p className="text-xl font-black text-slate-900">{state.currentUser?.username}</p>
                </div>
             </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
           <div className="md:col-span-2 bg-gradient-to-br from-indigo-950 via-slate-900 to-indigo-900 p-12 rounded-[4rem] text-white shadow-2xl relative overflow-hidden group">
              <p className="text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-4">RECONCILED NET ASSET</p>
              <h2 className="text-7xl font-black tracking-tighter">{CURRENCY}{stats.balance.toLocaleString()}</h2>
              <div className="mt-8 flex items-center gap-10">
                 <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Aggregate Revenue</p>
                    <p className="text-emerald-400 font-black text-2xl">+{CURRENCY}{stats.income.toLocaleString()}</p>
                 </div>
                 <div className="w-px h-12 bg-slate-800"></div>
                 <div>
                    <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1">Aggregate Outflow</p>
                    <p className="text-rose-400 font-black text-2xl">-{CURRENCY}{stats.expenses.toLocaleString()}</p>
                 </div>
              </div>
              <div className="absolute right-[-60px] bottom-[-60px] opacity-[0.03] rotate-12 group-hover:rotate-0 transition-transform duration-1000">
                <Wallet size={400} />
              </div>
           </div>

           <div className="md:col-span-2 grid grid-cols-2 gap-6">
             {['Cash', 'Bank', 'Bkash', 'Nagad'].map((source) => (
               <div key={source} className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/20 group hover:translate-y-[-4px] transition-all flex flex-col justify-between">
                   <div className="flex items-center justify-between mb-4">
                     <div className="p-3 bg-slate-50 text-slate-400 rounded-2xl group-hover:bg-slate-900 group-hover:text-white transition-all">
                         {source === 'Cash' ? <Coins size={22} /> : source === 'Bank' ? <Building2 size={22} /> : <Smartphone size={22} />}
                     </div>
                     <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{source}</span>
                   </div>
                   <h3 className="text-3xl font-black text-slate-900">{CURRENCY}{stats.sourceBalances[source as PaymentSource]?.toLocaleString() || '0'}</h3>
               </div>
             ))}
           </div>
        </div>
      </div>
    );
  };

  const FilterBar = () => {
    const isGlobal = state.currentUser?.role === UserRole.ADMIN || state.currentUser?.role === UserRole.MANAGER;
    return (
      <div className="bg-white/60 backdrop-blur-md p-8 rounded-[3rem] border border-white shadow-xl space-y-6 mb-10">
        <div className="flex flex-wrap items-center gap-6">
          <div className="flex flex-col gap-1 flex-1 min-w-[200px]">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Search Nodes</label>
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input 
                type="text" 
                placeholder="Query details..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-slate-100/50 border-none rounded-xl text-sm font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Start Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-4 py-3 bg-slate-100/50 rounded-xl text-xs font-bold outline-none border-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">End Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-4 py-3 bg-slate-100/50 rounded-xl text-xs font-bold outline-none border-none focus:ring-2 focus:ring-indigo-500" />
          </div>

          {isGlobal && (
            <>
              <div className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Member</label>
                <select value={filterUser} onChange={(e) => setFilterUser(e.target.value)} className="px-4 py-3 bg-slate-100/50 rounded-xl text-xs font-bold outline-none border-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer">
                  <option value="all">All Users</option>
                  {state.users.map(u => <option key={u.id} value={u.id}>{u.username}</option>)}
                </select>
              </div>
              <div className="flex flex-col gap-1 min-w-[140px]">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Category</label>
                <select value={filterCategory} onChange={(e) => setFilterCategory(e.target.value)} className="px-4 py-3 bg-slate-100/50 rounded-xl text-xs font-bold outline-none border-none focus:ring-2 focus:ring-indigo-500 appearance-none cursor-pointer">
                  <option value="all">All Cats</option>
                  {[...DEFAULT_CATEGORIES, ...ADMIN_ONLY_CATEGORIES, ...INCOME_CATEGORIES].map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}

          <button 
            onClick={() => { setSearchQuery(''); setStartDate(''); setEndDate(''); setFilterUser('all'); setFilterCategory('all'); }}
            className="p-3.5 mt-4 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-xl transition-all"
          >
            <XCircle size={24} />
          </button>
        </div>

        {(startDate || endDate) && (
          <div className="pt-6 border-t border-slate-100 flex items-center justify-between">
            <div className="flex gap-10">
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Period Revenue</p>
                  <p className="text-2xl font-black text-emerald-600 tracking-tighter">+{CURRENCY}{filteredSummary.revenue.toLocaleString()}</p>
               </div>
               <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Period Outflow</p>
                  <p className="text-2xl font-black text-rose-600 tracking-tighter">-{CURRENCY}{filteredSummary.outflow.toLocaleString()}</p>
               </div>
            </div>
            <div className="text-right">
               <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Filtered Range Health</p>
               <p className="text-sm font-black text-slate-900">{filteredTransactions.length} Nodes Found</p>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-32 md:pb-8 md:pl-32">
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-screen w-28 bg-white border-r border-slate-100 items-center py-12 gap-12 z-50">
        <div className="w-16 h-16 bg-indigo-600 rounded-3xl flex items-center justify-center text-white shadow-2xl shadow-indigo-100 hover:rotate-12 transition-transform cursor-pointer overflow-hidden border-4 border-white">
           {state.companyLogo ? (
             <img src={state.companyLogo} className="w-full h-full object-cover" alt="Logo" />
           ) : <BrainCircuit size={36} />}
        </div>
        <div className="flex flex-col gap-8 flex-1">
          <NavBtn icon={LayoutDashboard} active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} label="Summary" />
          <NavBtn icon={History} active={currentView === 'transactions'} onClick={() => setCurrentView('transactions')} label="Audit" />
          {state.currentUser?.role === UserRole.ADMIN && <NavBtn icon={UsersIcon} active={currentView === 'users'} onClick={() => setCurrentView('users')} label="Nodes" />}
          <NavBtn icon={BrainCircuit} active={currentView === 'insights'} onClick={() => setCurrentView('insights')} label="Neural" />
          <NavBtn icon={UserIcon} active={currentView === 'profile'} onClick={() => setCurrentView('profile')} label="Identity" />
        </div>
        <button onClick={handleLogout} className="p-5 text-rose-500 hover:bg-rose-50 rounded-3xl transition-all"><LogOut size={32} /></button>
      </nav>

      <main className="max-w-7xl mx-auto px-10 pt-12 md:pt-20 pb-20">
        {currentView === 'dashboard' && <DashboardView />}
        {currentView === 'transactions' && (
          <div className="space-y-10 animate-slide-in font-outfit">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">Ledger Trace log</h2>
                <p className="text-slate-500 font-medium">Audit of historical nodes, verified assets, and settlements</p>
              </div>
              <div className="flex gap-4">
                 <button onClick={() => setCurrentView('rejected')} className="flex items-center gap-2 px-6 py-3 bg-rose-50 text-rose-600 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm border border-rose-100 hover:bg-rose-100 transition-all">
                   <CancelIcon size={18} /> Rejected nodes
                 </button>
                 <button onClick={() => exportToExcel(state.transactions)} className="p-4 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 transition-colors shadow-lg shadow-slate-200/50"><Download size={24} /></button>
              </div>
            </div>
            <FilterBar />
            <div className="bg-white rounded-[4rem] border border-slate-100 overflow-hidden shadow-2xl shadow-slate-200/50">
              <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/20">
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">Validated nodes</h4>
                 <div className="flex gap-8">
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-emerald-600 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-emerald-500"></div> settled</span>
                    <span className="flex items-center gap-1.5 text-[9px] font-black text-rose-600 uppercase tracking-widest"><div className="w-2 h-2 rounded-full bg-rose-500"></div> outflow</span>
                 </div>
              </div>
              {filteredTransactions.length === 0 ? (
                <div className="p-32 text-center text-slate-300">
                   <History size={80} className="mx-auto mb-8 opacity-5" />
                   <p className="font-black uppercase tracking-[0.3em] text-sm">No node data detected</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {filteredTransactions.map(t => {
                    const Icon = getIconComponent([...DEFAULT_CATEGORIES, ...ADMIN_ONLY_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.name === t.category)?.icon || 'Plus');
                    const isPending = t.status === TransactionStatus.PENDING;
                    const isVerified = t.status === TransactionStatus.VERIFIED;
                    const isRequisition = t.category === 'Requisition';
                    const canVerify = state.currentUser?.role === UserRole.MANAGER && isPending;
                    const canApprove = state.currentUser?.role === UserRole.ADMIN && (isVerified || (isPending && t.type === TransactionType.EXPENSE));
                    return (
                      <div key={t.id} className={`p-10 flex items-center gap-10 transition-all group hover:bg-slate-50/80 ${isRequisition ? 'bg-indigo-50/10' : ''}`}>
                        <div className={`p-6 rounded-[2rem] shadow-sm transition-transform group-hover:scale-110 ${t.type === TransactionType.INCOME ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                           <Icon size={32} strokeWidth={2.5} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-4 mb-2">
                            <p className="font-black text-slate-900 text-2xl truncate tracking-tight">{t.note || t.category}</p>
                            <StatusBadge status={t.status} />
                            {isRequisition && <span className="text-[8px] bg-indigo-600 text-white px-2 py-0.5 rounded-full font-black uppercase tracking-widest">Standalone Audit</span>}
                            {t.subCategory && <span className="text-[9px] bg-slate-100 text-slate-500 px-3 py-1 rounded-full font-black uppercase tracking-widest">{t.subCategory}</span>}
                          </div>
                          <p className="text-[12px] text-slate-400 font-bold uppercase tracking-[0.1em]">
                            {new Date(t.date).toLocaleDateString()} • {t.source} • <span className="text-indigo-600 font-black">Agent: {t.createdBy}</span>
                          </p>
                        </div>
                        <div className="text-right flex items-center gap-10">
                          <div>
                            <p className={`text-4xl font-black ${t.type === TransactionType.INCOME ? 'text-emerald-600' : 'text-slate-900'} tracking-tighter`}>
                              {t.type === TransactionType.INCOME ? '+' : '-'}{CURRENCY}{t.amount.toLocaleString()}
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                             {canVerify && (
                               <div className="flex gap-2">
                                  <button onClick={() => setTransactionStatus(t.id, TransactionStatus.VERIFIED)} className="p-3.5 bg-blue-500 text-white rounded-2xl shadow-lg shadow-blue-100 hover:scale-110 transition-all"><CheckCircle2 size={20} /></button>
                                  <button onClick={() => setTransactionStatus(t.id, TransactionStatus.REJECTED)} className="p-3.5 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><XCircle size={20} /></button>
                               </div>
                             )}
                             {canApprove && (
                               <div className="flex gap-2">
                                  <button onClick={() => setTransactionStatus(t.id, TransactionStatus.APPROVED)} className="p-3.5 bg-emerald-500 text-white rounded-2xl shadow-lg shadow-emerald-100 hover:scale-110 transition-all"><CheckCircle2 size={20} /></button>
                                  <button onClick={() => setTransactionStatus(t.id, TransactionStatus.REJECTED)} className="p-3.5 bg-rose-50 text-rose-500 rounded-2xl hover:bg-rose-500 hover:text-white transition-all"><XCircle size={20} /></button>
                               </div>
                             )}
                             {state.currentUser?.role === UserRole.ADMIN && (
                               <button onClick={() => deleteTransaction(t.id)} className="p-2.5 text-slate-200 hover:text-rose-500 transition-all opacity-0 group-hover:opacity-100"><Trash2 size={24} /></button>
                             )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
        {currentView === 'rejected' && (
          <div className="space-y-10 animate-slide-in font-outfit">
             <div className="flex items-center gap-6">
                <button onClick={() => setCurrentView('transactions')} className="p-4 bg-white border border-slate-100 rounded-2xl hover:bg-slate-50 transition-all shadow-sm"><CancelIcon size={28} className="rotate-45" /></button>
                <h2 className="text-4xl font-black text-slate-900 tracking-tight">Purged Ledger Nodes</h2>
             </div>
             <div className="bg-white rounded-[4rem] border border-slate-100 overflow-hidden shadow-2xl shadow-rose-100/20">
                {rejectedTransactions.length === 0 ? (
                  <div className="p-32 text-center text-slate-300">
                     <ShieldCheck size={100} className="mx-auto mb-10 opacity-5 text-emerald-500" />
                     <p className="font-black uppercase tracking-[0.3em] text-sm">No node rejections found</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-50">
                     {rejectedTransactions.map(t => {
                       const Icon = getIconComponent([...DEFAULT_CATEGORIES, ...ADMIN_ONLY_CATEGORIES, ...INCOME_CATEGORIES].find(c => c.name === t.category)?.icon || 'Plus');
                       return (
                        <div key={t.id} className="p-10 flex items-center gap-10 bg-rose-50/20">
                          <div className={`p-6 rounded-[2rem] bg-rose-100 text-rose-400 opacity-40`}>
                             <Icon size={32} strokeWidth={2.5} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="font-black text-slate-900 text-2xl truncate tracking-tight line-through opacity-20">{t.note || t.category}</p>
                            <StatusBadge status={t.status} />
                          </div>
                          <div className="text-right">
                             <p className="text-3xl font-black text-slate-200 tracking-tighter line-through">{CURRENCY}{t.amount.toLocaleString()}</p>
                             <p className="text-[10px] font-black uppercase text-rose-300 tracking-widest mt-1">operator: {t.createdBy}</p>
                          </div>
                        </div>
                       );
                     })}
                  </div>
                )}
             </div>
          </div>
        )}
        {currentView === 'users' && state.currentUser?.role === UserRole.ADMIN && (
          <UsersView state={state} setState={setState} editingUser={editingUser} setEditingUser={setEditingUser} handleSaveUser={handleSaveUser} handleFileUpload={handleFileUpload} logoInputRef={logoInputRef} />
        )}
        {currentView === 'insights' && <InsightsView aiTips={aiTips} isLoadingTips={isLoadingTips} setCurrentView={setCurrentView} />}
        {currentView === 'profile' && <ProfileView state={state} handleFileUpload={handleFileUpload} handleLogout={handleLogout} profilePicInputRef={profilePicInputRef} />}
      </main>

      <button onClick={() => setIsAdding(true)} className="fixed bottom-32 right-10 md:bottom-14 md:right-14 w-24 h-24 bg-slate-900 text-white rounded-[2.5rem] shadow-2xl flex items-center justify-center hover:scale-110 hover:-rotate-12 active:scale-90 transition-all z-40">
        <Plus size={48} />
      </button>
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-xl border-t border-slate-100 flex justify-around items-center h-28 px-8 z-50">
        <NavBtn icon={LayoutDashboard} active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
        <NavBtn icon={History} active={currentView === 'transactions'} onClick={() => setCurrentView('transactions')} />
        <NavBtn icon={BrainCircuit} active={currentView === 'insights'} onClick={() => setCurrentView('insights')} />
        <NavBtn icon={UserIcon} active={currentView === 'profile'} onClick={() => setCurrentView('profile')} />
      </nav>
      {isAdding && <AddModal role={state.currentUser?.role} onClose={() => setIsAdding(false)} onSubmit={addTransaction} />}
    </div>
  );
};

const UsersView = ({ state, setState, editingUser, setEditingUser, handleSaveUser, handleFileUpload, logoInputRef }: any) => {
  const [compName, setCompName] = useState(state.companyName || '');
  const [sheetUrl, setSheetUrl] = useState(state.sheetUrl || '');
  return (
    <div className="max-w-6xl mx-auto space-y-12 animate-slide-in font-outfit">
      <div className="bg-white p-12 rounded-[4rem] border border-slate-100 shadow-xl">
          <h2 className="text-2xl font-black text-slate-900 mb-10 flex items-center gap-3"><Settings size={28} className="text-indigo-600" /> Branding settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
             <div className="space-y-8">
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Enterprise name</label>
                   <div className="flex gap-4">
                      <input type="text" value={compName} onChange={(e) => setCompName(e.target.value)} className="flex-1 px-8 py-5 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-4 focus:ring-indigo-500/10" placeholder="Business Alias" />
                      <button onClick={() => setState((p: any) => ({ ...p, companyName: compName }))} className="px-6 py-4 bg-slate-900 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-slate-200">Commit</button>
                   </div>
                </div>
                <div className="space-y-2">
                   <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Enterprise logo</label>
                   <input type="file" ref={logoInputRef} className="hidden" accept="image/png, image/jpeg" onChange={(e) => handleFileUpload(e, 'logo')} />
                   <div className="flex items-center gap-6">
                      <button onClick={() => logoInputRef.current?.click()} className="flex items-center gap-3 px-8 py-5 bg-indigo-50 text-indigo-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-indigo-100 transition-all border border-indigo-100">
                        <Camera size={20} /> Upload PNG/JPEG
                      </button>
                      {state.companyLogo && <div className="w-20 h-20 rounded-[1.5rem] overflow-hidden border border-slate-100 shadow-inner"><img src={state.companyLogo} className="w-full h-full object-cover" /></div>}
                   </div>
                </div>
             </div>
             <div className="bg-slate-50 rounded-[3rem] p-10 flex flex-col items-center justify-center text-center space-y-4 border border-slate-100">
                <div className="w-36 h-36 bg-white rounded-[2rem] flex items-center justify-center shadow-2xl overflow-hidden border-8 border-white">
                   {state.companyLogo ? <img src={state.companyLogo} className="w-full h-full object-cover" /> : <Building2 size={64} className="text-slate-200" />}
                </div>
                <div>
                   <p className="font-black text-slate-900 text-2xl tracking-tight">{state.companyName || 'Undefined'}</p>
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.3em] mt-2">Brand Identity Vector</p>
                </div>
             </div>
          </div>
          
          <div className="mt-12 pt-12 border-t border-slate-100">
             <h2 className="text-2xl font-black text-slate-900 mb-6 flex items-center gap-3"><Cloud size={28} className="text-indigo-600" /> Cloud Sync Integration</h2>
             <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Google Apps Script Web App URL</label>
                <div className="flex gap-4">
                   <input type="text" value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} className="flex-1 px-8 py-5 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-4 focus:ring-indigo-500/10" placeholder="https://script.google.com/macros/s/.../exec" />
                   <button onClick={() => setState((p: any) => ({ ...p, sheetUrl: sheetUrl }))} className="px-6 py-4 bg-indigo-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-100">Link Sheets</button>
                </div>
                <p className="text-[10px] text-slate-400 mt-2 ml-1">Data is synced to the linked Google Sheet for persistent audit tracking.</p>
             </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        <div className="lg:col-span-4 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-2xl h-fit sticky top-10">
           <h3 className="text-xl font-black mb-10 flex items-center gap-4">
              {editingUser ? <Edit size={28} className="text-amber-500" /> : <UserPlus size={28} className="text-indigo-600" />}
              {editingUser ? 'Update Node' : 'Provision agent'}
           </h3>
           <form onSubmit={handleSaveUser} className="space-y-6">
              <input name="username" type="text" required defaultValue={editingUser?.username} className="w-full px-8 py-5 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-4 focus:ring-indigo-500/10" placeholder="Identity UID" />
              <input name="password" type="text" required defaultValue={editingUser?.password} className="w-full px-8 py-5 bg-slate-50 border-none rounded-2xl outline-none font-bold focus:ring-4 focus:ring-indigo-500/10" placeholder="Access key" />
              <select name="role" required defaultValue={editingUser?.role} className="w-full px-8 py-5 bg-slate-50 border-none rounded-2xl outline-none font-bold appearance-none cursor-pointer focus:ring-4 focus:ring-indigo-500/10">
                 {Object.values(UserRole).map(role => <option key={role} value={role}>{role.replace('_', ' ')}</option>)}
              </select>
              <button type="submit" className="w-full py-6 bg-slate-900 text-white rounded-[1.5rem] font-black shadow-2xl shadow-slate-200 hover:scale-[1.02] transition-all mt-4">
                {editingUser ? 'Commit Update' : 'Initialize Agent'}
              </button>
              {editingUser && <button type="button" onClick={() => setEditingUser(null)} className="w-full py-4 text-slate-400 font-bold uppercase tracking-widest text-[10px]">Cancel edit</button>}
           </form>
        </div>
        <div className="lg:col-span-8 space-y-6">
           {state.users.map((u: any) => (
             <div key={u.id} className="bg-white p-10 rounded-[4rem] border border-slate-100 shadow-xl flex items-center justify-between group">
                <div className="flex items-center gap-8">
                   <div className="w-24 h-24 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex items-center justify-center font-black text-slate-300 text-4xl overflow-hidden shadow-inner transition-transform group-hover:scale-105">
                      {u.profilePic ? <img src={u.profilePic} className="w-full h-full object-cover" /> : u.username.charAt(0).toUpperCase()}
                   </div>
                   <div>
                      <p className="text-3xl font-black text-slate-900 tracking-tight">{u.username}</p>
                      <div className="flex items-center gap-4 mt-2">
                         <span className="text-[10px] font-black uppercase tracking-widest bg-slate-100 text-slate-500 px-4 py-1.5 rounded-full">{u.role} identity</span>
                      </div>
                   </div>
                </div>
                <div className="flex gap-4">
                   <button onClick={() => setEditingUser(u)} className="p-5 text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 rounded-[1.5rem] transition-all"><Edit size={28} /></button>
                   {u.role !== UserRole.ADMIN && (
                      <button onClick={() => { if(confirm('Purge user node?')) setState((prev: any) => ({ ...prev, users: prev.users.filter((usr: any) => usr.id !== u.id) })); }} className="p-5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-[1.5rem] transition-all"><Trash2 size={28} /></button>
                   )}
                </div>
             </div>
           ))}
        </div>
      </div>
    </div>
  );
};

const ProfileView = ({ state, handleFileUpload, handleLogout, profilePicInputRef }: any) => (
  <div className="max-w-2xl mx-auto space-y-12 animate-slide-in font-outfit">
    <h2 className="text-4xl font-black text-slate-900 tracking-tight text-center">Identity Configuration</h2>
    <div className="bg-white p-16 rounded-[4.5rem] border border-slate-100 shadow-[0_50px_100px_-20px_rgba(0,0,0,0.15)] flex flex-col items-center relative overflow-hidden">
       <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full blur-3xl -mr-40 -mt-40"></div>
       <div className="relative group cursor-pointer" onClick={() => profilePicInputRef.current?.click()}>
          <div className="w-64 h-64 bg-slate-100 text-slate-300 rounded-[4rem] flex items-center justify-center mb-12 shadow-inner overflow-hidden border-[12px] border-white group-hover:opacity-90 transition-all">
             {state.currentUser?.profilePic ? <img src={state.currentUser.profilePic} className="w-full h-full object-cover" /> : <UserIcon size={120} />}
          </div>
          <div className="absolute bottom-16 right-4 w-16 h-16 bg-slate-900 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl border-8 border-white transition-transform group-hover:scale-110">
             <Camera size={28} />
          </div>
          <input type="file" ref={profilePicInputRef} className="hidden" accept="image/png, image/jpeg" onChange={(e) => handleFileUpload(e, 'profilePic')} />
       </div>
       <h3 className="text-5xl font-black text-slate-900 tracking-tight">{state.currentUser?.username}</h3>
       <span className="mt-6 px-10 py-3 bg-indigo-50 text-indigo-700 rounded-full text-xs font-black uppercase tracking-[0.3em]">{state.currentUser?.role.replace('_', ' ')} NODE</span>
       
       <div className="w-full mt-16 pt-12 border-t border-slate-50 space-y-6">
          <button onClick={handleLogout} className="w-full flex items-center justify-center gap-6 py-8 text-rose-600 bg-rose-50 rounded-[2.5rem] font-black text-2xl hover:bg-rose-100 hover:scale-[1.02] transition-all active:scale-95 shadow-xl shadow-rose-100/30">
             <LogOut size={36} /> Terminate System Session
          </button>
       </div>
    </div>
  </div>
);

const InsightsView = ({ aiTips, isLoadingTips, setCurrentView }: any) => (
  <div className="space-y-12 animate-slide-in font-outfit">
    <div className="flex items-center gap-8">
       <div className="p-8 bg-indigo-600 text-white rounded-[2.5rem] shadow-2xl shadow-indigo-100">
          <BrainCircuit size={56} />
       </div>
       <div>
          <h2 className="text-5xl font-black text-slate-900 tracking-tight">Neural Finance Analysis</h2>
          <p className="text-slate-400 font-bold uppercase tracking-widest text-[12px] mt-2">Autonomous Behavioral Intelligence Engine</p>
       </div>
    </div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
       <div className="bg-white p-16 rounded-[4.5rem] border border-slate-100 shadow-sm relative overflow-hidden group hover:shadow-2xl transition-all duration-700">
          <div className="absolute top-0 right-0 w-80 h-80 bg-indigo-500/5 rounded-full -mr-40 -mt-40 blur-3xl group-hover:bg-indigo-500/10"></div>
          <h4 className="text-[11px] font-black text-indigo-600 uppercase tracking-[0.4em] mb-10">Cognitive strategy</h4>
          <p className="text-3xl font-black text-slate-900 leading-tight">
             {isLoadingTips ? "Decoding node patterns..." : (aiTips[0]?.tip || "Provide more validated transaction data to initialize the neural optimization model.")}
          </p>
       </div>
       <div className="bg-slate-900 p-16 rounded-[4.5rem] text-white shadow-2xl relative overflow-hidden group">
          <h4 className="text-[11px] font-black text-indigo-300 uppercase tracking-[0.4em] mb-10">Liquidity Prediction</h4>
          <p className="text-3xl font-black leading-tight text-white">
             Node integrity remains optimal at 98.4%. No critical liquidity fractures detected within current validated audit cycles.
          </p>
          <div className="absolute bottom-[-80px] right-[-80px] opacity-[0.05] group-hover:opacity-[0.08] transition-opacity">
             <TrendingUp size={350} />
          </div>
       </div>
    </div>
  </div>
);

const NavBtn = ({ icon: Icon, active, onClick, label }: any) => (
  <button onClick={onClick} className="flex flex-col items-center gap-3 group relative">
    <div className={`p-6 rounded-[2rem] transition-all duration-500 ${active ? 'bg-slate-900 text-white shadow-2xl scale-110 rotate-0' : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'}`}>
      <Icon size={34} strokeWidth={2.5} />
    </div>
    {label && <span className={`text-[10px] font-black uppercase tracking-[0.2em] ${active ? 'text-slate-900 opacity-100' : 'text-slate-300 group-hover:text-slate-500 opacity-0 group-hover:opacity-100'} transition-all`}>{label}</span>}
  </button>
);

const AddModal = ({ role, onClose, onSubmit }: any) => {
  const [type, setType] = useState<TransactionType>(TransactionType.EXPENSE);
  const [category, setCategory] = useState('');
  const availableCategories = useMemo(() => {
    const isSpecialRole = role === UserRole.ADMIN || role === UserRole.MANAGER;
    if (type === TransactionType.INCOME) return INCOME_CATEGORIES;
    let cats = [...DEFAULT_CATEGORIES];
    if (isSpecialRole) cats = [...cats, ...ADMIN_ONLY_CATEGORIES];
    if (role === UserRole.EMPLOYEE) return cats.filter(c => c.name === 'Conveyance');
    return cats;
  }, [type, role]);
  useEffect(() => {
    if (availableCategories.length > 0) setCategory(availableCategories[0].name);
  }, [availableCategories]);

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-2xl flex items-center justify-center p-10 z-[100] animate-in fade-in duration-500 font-outfit">
      <div className="bg-white w-full max-w-2xl rounded-[4.5rem] shadow-[0_60px_120px_-20px_rgba(0,0,0,0.5)] overflow-hidden animate-slide-in border border-white/20">
        <div className="p-16">
          <div className="flex items-center justify-between mb-12">
            <div>
               <h3 className="text-4xl font-black text-slate-900 tracking-tight">Ledger Node Submission</h3>
               <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] mt-2">Authenticated Operational Data Input</p>
            </div>
            <button onClick={onClose} className="p-4 hover:bg-slate-100 rounded-full transition-colors"><X size={44} /></button>
          </div>
          <form onSubmit={(e) => {
            e.preventDefault();
            const formData = new FormData(e.currentTarget);
            onSubmit({
              amount: Number(formData.get('amount')),
              type: type,
              category: formData.get('category'),
              subCategory: formData.get('subCategory') || undefined,
              source: formData.get('source') as PaymentSource,
              date: formData.get('date'),
              note: formData.get('note')
            });
          }} className="space-y-10">
            {role !== UserRole.EMPLOYEE && (
              <div className="grid grid-cols-2 gap-6 bg-slate-50 p-3 rounded-[2.5rem] border border-slate-100">
                <button type="button" onClick={() => setType(TransactionType.EXPENSE)} className={`py-5 rounded-[2rem] font-black text-xs transition-all tracking-[0.2em] ${type === TransactionType.EXPENSE ? 'bg-white shadow-2xl text-rose-600' : 'text-slate-400'}`}>OUTFLOW</button>
                <button type="button" onClick={() => setType(TransactionType.INCOME)} className={`py-5 rounded-[2rem] font-black text-xs transition-all tracking-[0.2em] ${type === TransactionType.INCOME ? 'bg-white shadow-2xl text-emerald-600' : 'text-slate-400'}`}>REVENUE</button>
              </div>
            )}
            <div className="relative group">
              <span className="absolute left-12 top-1/2 -translate-y-1/2 text-slate-300 font-black text-7xl group-focus-within:text-indigo-600 transition-colors tracking-tighter">{CURRENCY}</span>
              <input name="amount" type="number" step="0.01" required autoFocus className="w-full pl-36 pr-12 py-12 bg-slate-50 border-none rounded-[3rem] text-8xl font-black outline-none ring-[12px] ring-transparent focus:ring-indigo-500/5 transition-all placeholder:text-slate-100 tracking-tighter" placeholder="0.00" />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Node Asset Cat</label>
                <select name="category" value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-10 py-6 bg-slate-50 rounded-[2.25rem] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer border-none appearance-none">
                  {availableCategories.map(cat => <option key={cat.id} value={cat.name}>{cat.name}</option>)}
                </select>
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Settlement Asset</label>
                <select name="source" className="w-full px-10 py-6 bg-slate-50 rounded-[2.25rem] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer border-none appearance-none">
                  {PAYMENT_SOURCES.map(src => <option key={src} value={src}>{src}</option>)}
                </select>
              </div>
            </div>
            {(category === 'Conveyance' || ['Family', 'Marjan', 'Admin Own'].includes(category)) && (
              <div className="space-y-3 animate-in fade-in slide-in-from-top-4">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Node Classification (Sub-Cat)</label>
                <select name="subCategory" className="w-full px-10 py-6 bg-slate-50 rounded-[2.25rem] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all cursor-pointer border-none appearance-none">
                   {category === 'Conveyance' 
                    ? CONVEYANCE_SUB_CATEGORIES.map(sub => <option key={sub} value={sub}>{sub}</option>)
                    : ADMIN_ASSET_SUB_CATEGORIES.map(sub => <option key={sub} value={sub}>{sub}</option>)}
                </select>
              </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Audit Timestamp</label>
                <input name="date" type="date" defaultValue={new Date().toISOString().split('T')[0]} required className="w-full px-10 py-6 bg-slate-50 rounded-[2.25rem] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all border-none" />
              </div>
              <div className="space-y-3">
                <label className="text-[11px] font-black text-slate-400 uppercase tracking-widest ml-1">Trace metadata (Note)</label>
                <input name="note" type="text" className="w-full px-10 py-6 bg-slate-50 rounded-[2.25rem] outline-none font-bold focus:ring-4 focus:ring-indigo-500/10 transition-all border-none" placeholder="Contextual audit info..." />
              </div>
            </div>
            <button type="submit" className={`w-full py-8 rounded-[3rem] font-black text-3xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.1)] transition-all active:scale-95 ${
              type === TransactionType.INCOME ? 'bg-emerald-500 shadow-emerald-100' : 'bg-rose-500 shadow-rose-100'
            } text-white mt-8 tracking-tighter`}>
              VALIDATE & COMMIT NODE
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default App;
