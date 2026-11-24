/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, createContext, useContext } from 'react';
import {
  Smartphone,
  Headphones,
  Wrench,
  BarChart3,
  Users,
  Plus,
  Search,
  Trash2,
  Edit,
  Check,
  AlertTriangle,
  Copy,
  Download,
  X,
  Phone,
  MapPin,
  User,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Calendar,
  RotateCcw,
  CheckCircle2,
  Package,
  Layers,
  Info,
  LogOut,
  LogIn,
  Cloud,
  CloudOff,
  RefreshCw,
  Share2,
  MessageCircle,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
  Activity
} from 'lucide-react';
import { auth, db, googleProvider } from './firebase';
import {
  signInWithPopup,
  signInWithRedirect,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  getDocsFromServer,
  deleteDoc,
  onSnapshot,
  writeBatch,
  serverTimestamp,
  waitForPendingWrites
} from 'firebase/firestore';

const OWNER_EMAILS = ['abduelsattertelecom@gmail.com', 'joysingle2018@gmail.com'];

// --- Types ---
export interface MobileItem {
  id: string;
  model: string;
  ram: string;
  storage: string;
  purchasePrice: number;
  imei: string;
  condition: 'নতুন' | 'ব্যবহৃত' | 'মেরামত লাগবে';
  note: string;
  purchaseDate: string;
  status: 'stock' | 'sold';
  sellingPrice?: number;
  sellingDate?: string;
  salePrice?: number;
  showToCustomers?: boolean;
  createdBy?: string;
  updatedBy?: string;
  updatedAt: number;
}

export interface GadgetItem {
  id: string;
  name: string;
  type: 'স্পিকার' | 'ইয়ারবাড' | 'স্মার্টওয়াচ' | 'পাওয়ার ব্যাংক' | 'চার্জার' | 'অন্যান্য';
  purchasePrice: number;
  quantity: number;
  note: string;
  purchaseDate: string;
  salePrice?: number;
  showToCustomers?: boolean;
  createdBy?: string;
  updatedBy?: string;
  updatedAt: number;
}

export interface PartItem {
  id: string;
  model: string;
  partType: string;
  quantity: number;
  location: string;
  note: string;
  createdBy?: string;
  updatedBy?: string;
  updatedAt: number;
}

export interface SaleRecord {
  id: string;
  type: 'mobile' | 'gadget';
  itemId: string;
  itemName: string;
  purchasePrice: number;
  sellingPrice: number;
  quantity: number;
  profit: number;
  date: string;
  soldBy?: { email: string; name: string };
  timestamp: number;
}

export interface ActivityLog {
  id: string;
  by: string;
  byName: string;
  role: 'owner' | 'admin';
  action: string;
  itemName: string;
  amount?: number;
  at: any;
}

export interface CatalogItem {
  id: string;
  kind: 'mobile' | 'gadget';
  title: string;
  ram?: string;
  storage?: string;
  condition?: string;
  price: number | null;
  qty: number;
  sold: boolean;
  soldAt?: string;
  visible: boolean;
  updatedAt: number;
}

export interface AppData {
  mobiles: MobileItem[];
  gadgets: GadgetItem[];
  parts: PartItem[];
  sales: SaleRecord[];
  catalog: CatalogItem[];
  admins: { email: string; addedBy: string; addedAt: number }[];
  activity: ActivityLog[];
}

const LOCAL_STORAGE_KEY = 'satter_telecom_app_data_v1';

const getLocalDateStr = (date: Date = new Date()): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// --- Confirm Dialog Context ---
interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDanger?: boolean;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(() => Promise.resolve(false));

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [role, setRole] = useState<'owner' | 'admin' | 'customer' | null>(null);

  const [authMode, setAuthMode] = useState<'login' | 'signup'>('login');
  const [emailInput, setEmailInput] = useState('');
  const [passInput, setPassInput] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Management tabs & Customer tabs
  const [activeTab, setActiveTab] = useState<'mobiles' | 'gadgets' | 'parts' | 'accounting' | 'manage'>('mobiles');
  const [customerTab, setCustomerTab] = useState<'mobiles' | 'gadgets'>('mobiles');

  const [data, setData] = useState<AppData>({
    mobiles: [],
    gadgets: [],
    parts: [],
    sales: [],
    catalog: [],
    admins: [],
    activity: []
  });

  const [toast, setToast] = useState<{ message: string; isError?: boolean } | null>(null);
  const [syncStatus, setSyncStatus] = useState<'synced' | 'offline' | 'syncing'>('synced');

  // Confirm dialog state
  const [confirmState, setConfirmState] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    confirmText: string;
    cancelText: string;
    isDanger: boolean;
    resolve: (val: boolean) => void;
  } | null>(null);

  const confirm = (options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setConfirmState({
        isOpen: true,
        title: options.title,
        message: options.message,
        confirmText: options.confirmText || 'হ্যাঁ',
        cancelText: options.cancelText || 'না, থাক',
        isDanger: !!options.isDanger,
        resolve
      });
    });
  };

  // Modals
  const [showMobileModal, setShowMobileModal] = useState(false);
  const [editingMobile, setEditingMobile] = useState<MobileItem | null>(null);

  const [showGadgetModal, setShowGadgetModal] = useState(false);
  const [editingGadget, setEditingGadget] = useState<GadgetItem | null>(null);

  const [showPartModal, setShowPartModal] = useState(false);
  const [editingPart, setEditingPart] = useState<PartItem | null>(null);

  const [sellingMobile, setSellingMobile] = useState<MobileItem | null>(null);
  const [sellMobilePrice, setSellMobilePrice] = useState('');
  const [sellMobileDate, setSellMobileDate] = useState(getLocalDateStr());
  const [lastSaleSuccessModal, setLastSaleSuccessModal] = useState<{ text: string; profit: number } | null>(null);

  const [sellingGadget, setSellingGadget] = useState<GadgetItem | null>(null);
  const [sellGadgetQty, setSellGadgetQty] = useState('1');
  const [sellGadgetPrice, setSellGadgetPrice] = useState('');
  const [sellGadgetDate, setSellGadgetDate] = useState(getLocalDateStr());

  const [showMigrationPrompt, setShowMigrationPrompt] = useState(false);
  const [localLegacyData, setLocalLegacyData] = useState<AppData | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auth State Listener & Role determination
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser || !firebaseUser.emailVerified) {
        setRole('customer');
        setAuthLoading(false);
        return;
      }

      const email = (firebaseUser.email || '').toLowerCase();
      if (OWNER_EMAILS.includes(email)) {
        setRole('owner');
        setAuthLoading(false);
      } else {
        try {
          const adminDocRef = doc(db, 'admins', email);
          const snap = await getDoc(adminDocRef);
          if (snap.exists()) {
            setRole('admin');
          } else {
            setRole('customer');
          }
        } catch (e) {
          setRole('customer');
        }
        setAuthLoading(false);
      }

      // Check legacy data for migration if owner
      if (OWNER_EMAILS.includes(email)) {
        try {
          const rawLocal = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (rawLocal) {
            const parsed = JSON.parse(rawLocal);
            const mobilesSnap = await getDocs(collection(db, 'mobiles'));
            if (mobilesSnap.empty && (parsed.mobiles?.length > 0 || parsed.gadgets?.length > 0)) {
              setLocalLegacyData(parsed);
              setShowMigrationPrompt(true);
            }
          }
        } catch (e) {
          console.error('Legacy migration check error:', e);
        }
      }
    });

    return () => unsubscribe();
  }, []);

  // Realtime Listeners based on Role
  useEffect(() => {
    if (!user) {
      setData({
        mobiles: [],
        gadgets: [],
        parts: [],
        sales: [],
        catalog: [],
        admins: [],
        activity: []
      });
      return;
    }

    setSyncStatus('syncing');

    // Catalog is always read for everyone
    const unsubCatalog = onSnapshot(collection(db, 'catalog'), (snap) => {
      const catalog = snap.docs.map(d => ({ ...(d.data() as CatalogItem), id: d.id }));
      setData(prev => ({ ...prev, catalog }));
      setSyncStatus('synced');
    }, (err) => {
      console.warn('Catalog snapshot error:', err.code);
      if (err.code === 'permission-denied') {
        console.error('Permission denied on catalog');
      }
      setSyncStatus('offline');
    });

    let unsubMobiles = () => {};
    let unsubGadgets = () => {};
    let unsubParts = () => {};
    let unsubSales = () => {};
    let unsubAdmins = () => {};
    let unsubActivity = () => {};

    if (role === 'owner' || role === 'admin') {
      unsubMobiles = onSnapshot(collection(db, 'mobiles'), (snap) => {
        const mobiles = snap.docs.map(d => ({ ...(d.data() as MobileItem), id: d.id }));
        setData(prev => ({ ...prev, mobiles }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));

      unsubGadgets = onSnapshot(collection(db, 'gadgets'), (snap) => {
        const gadgets = snap.docs.map(d => ({ ...(d.data() as GadgetItem), id: d.id }));
        setData(prev => ({ ...prev, gadgets }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));

      unsubParts = onSnapshot(collection(db, 'parts'), (snap) => {
        const parts = snap.docs.map(d => ({ ...(d.data() as PartItem), id: d.id }));
        setData(prev => ({ ...prev, parts }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));

      unsubSales = onSnapshot(collection(db, 'sales'), (snap) => {
        const sales = snap.docs.map(d => ({ ...(d.data() as SaleRecord), id: d.id }));
        setData(prev => ({ ...prev, sales }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));

      unsubActivity = onSnapshot(collection(db, 'activity'), (snap) => {
        const activity = snap.docs.map(d => ({ ...(d.data() as ActivityLog), id: d.id }));
        activity.sort((a, b) => (b.at?.toMillis?.() || b.at || 0) - (a.at?.toMillis?.() || a.at || 0));
        setData(prev => ({ ...prev, activity }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));
    }

    if (role === 'owner') {
      unsubAdmins = onSnapshot(collection(db, 'admins'), (snap) => {
        const admins = snap.docs.map(d => ({ email: d.id, ...(d.data() as any) }));
        setData(prev => ({ ...prev, admins }));
        setSyncStatus('synced');
      }, () => setSyncStatus('offline'));
    }

    return () => {
      unsubCatalog();
      unsubMobiles();
      unsubGadgets();
      unsubParts();
      unsubSales();
      unsubAdmins();
      unsubActivity();
    };
  }, [user, role]);

  const showToast = (message: string, isError: boolean = false) => {
    if (toastTimerRef.current) {
      clearTimeout(toastTimerRef.current);
    }
    setToast({ message, isError });
    toastTimerRef.current = setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, 4000);
  };

  // --- Manual Refresh Handler (Fetches latest from Firestore server) ---
  const handleRefreshData = async () => {
    if (isRefreshing) return;
    if (!user) {
      showToast('সর্বশেষ তথ্য দেখতে অনুগ্রহ করে লগইন করুন', true);
      return;
    }

    setIsRefreshing(true);
    setSyncStatus('syncing');
    try {
      const catalogSnap = await getDocsFromServer(collection(db, 'catalog'));
      const catalog = catalogSnap.docs.map(d => ({ ...(d.data() as CatalogItem), id: d.id }));

      if (role === 'owner' || role === 'admin') {
        const [mobilesSnap, gadgetsSnap, partsSnap, salesSnap, activitySnap] = await Promise.all([
          getDocsFromServer(collection(db, 'mobiles')),
          getDocsFromServer(collection(db, 'gadgets')),
          getDocsFromServer(collection(db, 'parts')),
          getDocsFromServer(collection(db, 'sales')),
          getDocsFromServer(collection(db, 'activity'))
        ]);

        const mobiles = mobilesSnap.docs.map(d => ({ ...(d.data() as MobileItem), id: d.id }));
        const gadgets = gadgetsSnap.docs.map(d => ({ ...(d.data() as GadgetItem), id: d.id }));
        const parts = partsSnap.docs.map(d => ({ ...(d.data() as PartItem), id: d.id }));
        const sales = salesSnap.docs.map(d => ({ ...(d.data() as SaleRecord), id: d.id }));
        const activity = activitySnap.docs.map(d => ({ ...(d.data() as ActivityLog), id: d.id }));
        activity.sort((a, b) => (b.at?.toMillis?.() || b.at || 0) - (a.at?.toMillis?.() || a.at || 0));

        let admins = data.admins;
        if (role === 'owner') {
          const adminsSnap = await getDocsFromServer(collection(db, 'admins'));
          admins = adminsSnap.docs.map(d => ({ email: d.id, ...(d.data() as any) }));
        }

        setData({ mobiles, gadgets, parts, sales, catalog, admins, activity });
      } else {
        setData(prev => ({ ...prev, catalog }));
      }

      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then(reg => reg?.update()).catch(() => {});
      }

      setSyncStatus('synced');
      showToast('সব ডাটা রিফ্রেশ হয়েছে ✓');
    } catch (err: any) {
      console.warn('Refresh error:', err);
      if (err?.code === 'unavailable' || !navigator.onLine) {
        setSyncStatus('offline');
        showToast('ইন্টারনেট নেই, সর্বশেষ সংরক্ষিত ডাটা দেখানো হচ্ছে', true);
      } else {
        setSyncStatus('synced');
        showToast('রিফ্রেশ করতে সমস্যা হয়েছে', true);
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  // --- Auth Handlers ---
  const handleGoogleLogin = async () => {
    setAuthError(null);
    try {
      googleProvider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        return; // ignore user cancellation
      }
      if (err.code === 'auth/popup-blocked' || err.code === 'auth/operation-not-supported-in-this-environment') {
        try {
          await signInWithRedirect(auth, googleProvider);
        } catch (redirectErr: any) {
          setAuthError('লগইন ব্যর্থ হয়েছে: ' + (redirectErr.message || 'নেটওয়ার্ক সমস্যা'));
        }
      } else {
        setAuthError('লগইন ত্রুটি: ' + err.message);
      }
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    if (!emailInput || !passInput) {
      setAuthError('ইমেইল ও পাসওয়ার্ড দিন');
      return;
    }
    try {
      if (authMode === 'login') {
        await signInWithEmailAndPassword(auth, emailInput.trim(), passInput);
      } else {
        await createUserWithEmailAndPassword(auth, emailInput.trim(), passInput);
        showToast('একাউন্ট তৈরি হয়েছে ✓');
      }
    } catch (err: any) {
      setAuthError('ত্রুটি: ' + err.message);
    }
  };

  // --- Robust Logout Handler ---
  const handleLogout = async () => {
    try {
      // Check pending writes with 3s timeout
      let hasPending = false;
      try {
        await Promise.race([
          waitForPendingWrites(db),
          new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000))
        ]);
      } catch (e) {
        hasPending = true;
      }

      let confirmMsg = 'লগআউট করতে চান?';
      let isDanger = false;
      if (hasPending) {
        confirmMsg = 'ইন্টারনেট নেই বা কিছু কাজ এখনো অনলাইনে সেভ হয়নি। এখন লগআউট করলে সেগুলো হারিয়ে যেতে পারে। নেট এলে লগআউট করুন।';
        isDanger = true;
      }

      const ok = await confirm({
        title: 'লগআউট নিশ্চিতকরণ',
        message: confirmMsg,
        confirmText: hasPending ? 'তবুও লগআউট' : 'হ্যাঁ, লগআউট',
        cancelText: hasPending ? 'অপেক্ষা করুন' : 'না, থাক',
        isDanger
      });

      if (!ok) return;

      setIsLoggingOut(true);
      await signOut(auth);

      // Reset state completely
      setUser(null);
      setRole(null);
      setAuthError(null);
      setActiveTab('mobiles');
      setCustomerTab('mobiles');
      setShowMobileModal(false);
      setShowGadgetModal(false);
      setShowPartModal(false);
      setSellingMobile(null);
      setSellingGadget(null);
      setData({
        mobiles: [],
        gadgets: [],
        parts: [],
        sales: [],
        catalog: [],
        admins: [],
        activity: []
      });

      showToast('লগআউট হয়েছে ✓');
    } catch (err: any) {
      showToast('লগআউট হয়নি, আবার চেষ্টা করুন: ' + (err.message || ''), true);
    } finally {
      setIsLoggingOut(false);
    }
  };

  // --- Migration Handler ---
  const handleConfirmMigration = async () => {
    if (!user || !localLegacyData) return;
    try {
      const batch = writeBatch(db);
      for (const m of localLegacyData.mobiles || []) {
        batch.set(doc(db, 'mobiles', m.id), { ...m, showToCustomers: true, salePrice: m.purchasePrice ? m.purchasePrice * 1.2 : 0 });
      }
      for (const g of localLegacyData.gadgets || []) {
        batch.set(doc(db, 'gadgets', g.id), { ...g, showToCustomers: true, salePrice: g.purchasePrice ? g.purchasePrice * 1.2 : 0 });
      }
      for (const p of localLegacyData.parts || []) {
        batch.set(doc(db, 'parts', p.id), p);
      }
      for (const s of localLegacyData.sales || []) {
        batch.set(doc(db, 'sales', s.id), s);
      }
      await batch.commit();
      localStorage.removeItem(LOCAL_STORAGE_KEY);
      setShowMigrationPrompt(false);
      showToast('পুরনো ডাটা শেয়ার্ড দোকানে স্থানান্তরিত হয়েছে ✓');
    } catch (e) {
      showToast('মাইগ্রেশন ব্যর্থ', true);
    }
  };

  const syncCatalogFull = async () => {
    try {
      const batch = writeBatch(db);
      data.mobiles.forEach(m => {
        const catRef = doc(db, 'catalog', m.id);
        const isSold = m.status === 'sold';
        const catalogItem: CatalogItem = {
          id: m.id,
          kind: 'mobile',
          title: m.model,
          ram: m.ram,
          storage: m.storage,
          condition: m.condition,
          price: m.showToCustomers !== false ? (m.salePrice || null) : null,
          qty: isSold ? 0 : 1,
          sold: isSold,
          soldAt: m.sellingDate,
          visible: m.showToCustomers !== false,
          updatedAt: Date.now()
        };
        batch.set(catRef, catalogItem);
      });

      data.gadgets.forEach(g => {
        const catRef = doc(db, 'catalog', g.id);
        const catalogItem: CatalogItem = {
          id: g.id,
          kind: 'gadget',
          title: g.name,
          price: g.showToCustomers !== false ? (g.salePrice || null) : null,
          qty: g.quantity,
          sold: g.quantity === 0,
          visible: g.showToCustomers !== false,
          updatedAt: Date.now()
        };
        batch.set(catRef, catalogItem);
      });

      await batch.commit();
      showToast('ক্যাটালগ সফলভাবে সিঙ্ক হয়েছে ✓');
    } catch (e) {
      showToast('ক্যাটালগ সিঙ্কে সমস্যা হয়েছে', true);
    }
  };

  useEffect(() => {
    if (role && role !== 'customer' && data.catalog.length === 0 && (data.mobiles.length > 0 || data.gadgets.length > 0)) {
      syncCatalogFull();
    }
  }, [role, data.catalog.length, data.mobiles.length, data.gadgets.length]);

  if (authLoading) {
    return (
      <div className="fixed inset-0 bg-slate-900 text-white flex items-center justify-center p-4">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto text-yellow-400" />
          <p className="text-sm font-medium">লোড হচ্ছে...</p>
        </div>
      </div>
    );
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {/* Toast Notification */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed top-[max(0.75rem,env(safe-area-inset-top,0.75rem))] left-3 right-3 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md z-50 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-2.5 border animate-fade-in ${
            toast.isError ? 'bg-red-700 border-red-500' : 'bg-slate-900 border-slate-700'
          }`}
        >
          {toast.isError ? (
            <AlertTriangle className="w-5 h-5 text-yellow-300 shrink-0" />
          ) : (
            <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          )}
          <span className="font-medium text-sm leading-snug">{toast.message}</span>
        </div>
      )}

      {/* Confirm Dialog Modal (Bottom sheet on mobile, centered card on desktop) */}
      {confirmState && confirmState.isOpen && (
        <div className="fixed inset-0 bg-black/65 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 animate-fade-in">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] sm:pb-6 shadow-2xl space-y-4 animate-slide-up">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <div className="space-y-1.5">
              <h3 className="font-bold text-lg text-slate-900">{confirmState.title}</h3>
              <p className="text-sm text-slate-600 leading-relaxed">{confirmState.message}</p>
            </div>
            <div className="flex gap-2.5 pt-1">
              <button
                onClick={() => {
                  confirmState.resolve(false);
                  setConfirmState(null);
                }}
                className="flex-1 bg-slate-100 hover:bg-slate-200 active:scale-[0.98] transition-all text-slate-700 font-bold py-3 px-4 rounded-2xl text-sm min-h-[44px]"
              >
                {confirmState.cancelText}
              </button>
              <button
                onClick={() => {
                  confirmState.resolve(true);
                  setConfirmState(null);
                }}
                className={`flex-1 font-bold py-3 px-4 rounded-2xl text-sm shadow text-white active:scale-[0.98] transition-all min-h-[44px] ${
                  confirmState.isDanger ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-900 hover:bg-blue-800'
                }`}
              >
                {confirmState.confirmText}
              </button>
            </div>
          </div>
        </div>
      )}

      {!user || role === 'customer' ? (
        <CustomerView
          user={user}
          data={data}
          onGoogleLogin={handleGoogleLogin}
          onLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          onRefresh={handleRefreshData}
          isRefreshing={isRefreshing}
          customerTab={customerTab}
          setCustomerTab={setCustomerTab}
          authError={authError}
          setAuthError={setAuthError}
        />
      ) : (
        <StaffView
          user={user}
          role={role}
          data={data}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          syncStatus={syncStatus}
          handleLogout={handleLogout}
          isLoggingOut={isLoggingOut}
          handleRefreshData={handleRefreshData}
          isRefreshing={isRefreshing}
          syncCatalogFull={syncCatalogFull}
          showToast={showToast}
          showMigrationPrompt={showMigrationPrompt}
          setShowMigrationPrompt={setShowMigrationPrompt}
          handleConfirmMigration={handleConfirmMigration}
          lastSaleSuccessModal={lastSaleSuccessModal}
          setLastSaleSuccessModal={setLastSaleSuccessModal}
          showMobileModal={showMobileModal}
          setShowMobileModal={setShowMobileModal}
          editingMobile={editingMobile}
          setEditingMobile={setEditingMobile}
          showGadgetModal={showGadgetModal}
          setShowGadgetModal={setShowGadgetModal}
          editingGadget={editingGadget}
          setEditingGadget={setEditingGadget}
          showPartModal={showPartModal}
          setShowPartModal={setShowPartModal}
          editingPart={editingPart}
          setEditingPart={setEditingPart}
          sellingMobile={sellingMobile}
          setSellingMobile={setSellingMobile}
          sellMobilePrice={sellMobilePrice}
          setSellMobilePrice={setSellMobilePrice}
          sellMobileDate={sellMobileDate}
          setSellMobileDate={setSellMobileDate}
          sellingGadget={sellingGadget}
          setSellingGadget={setSellingGadget}
          sellGadgetQty={sellGadgetQty}
          setSellGadgetQty={setSellGadgetQty}
          sellGadgetPrice={sellGadgetPrice}
          setSellGadgetPrice={setSellGadgetPrice}
          sellGadgetDate={sellGadgetDate}
          setSellGadgetDate={setSellGadgetDate}
        />
      )}
    </ConfirmContext.Provider>
  );
}

// --- Customer View ---
function CustomerView({ user, data, onGoogleLogin, onLogout, isLoggingOut, onRefresh, isRefreshing, customerTab, setCustomerTab, authError }: any) {
  const [search, setSearch] = useState('');
  const [filterCond, setFilterCond] = useState<'all' | 'নতুন' | 'ব্যবহৃত'>('all');

  const customerMobiles = data.catalog.filter((c: CatalogItem) => c.kind === 'mobile' && c.visible);
  const customerGadgets = data.catalog.filter((c: CatalogItem) => c.kind === 'gadget' && c.visible);

  const filteredMobiles = customerMobiles.filter((m: CatalogItem) => {
    const match = m.title.toLowerCase().includes(search.toLowerCase());
    if (filterCond === 'নতুন') return match && m.condition === 'নতুন';
    if (filterCond === 'ব্যবহৃত') return match && m.condition === 'ব্যবহৃত';
    return match;
  });

  const filteredGadgets = customerGadgets.filter((g: CatalogItem) => g.title.toLowerCase().includes(search.toLowerCase()));

  const handleOrderWhatsApp = (item: CatalogItem, qty: number = 1) => {
    const customerName = user?.displayName || user?.email || 'গ্রাহক';
    const priceStr = item.price ? `৳${item.price.toLocaleString('en-US')}` : 'দাম জানতে চাই';
    const qtyPart = item.kind === 'gadget' ? `\n🔢 পরিমাণ: ${qty} টি` : '';
    const details = item.kind === 'mobile' ? ` (${item.ram}/${item.storage}, ${item.condition})` : '';

    const text = `আসসালামু আলাইকুম, আমি ${customerName}।\nআমি আপনার দোকান থেকে এই পণ্যটি কিনতে চাই:\n📱 পণ্য: ${item.title}${details}\n💰 দাম: ${priceStr}${qtyPart}\nপণ্যটি কি এখনো আছে? কীভাবে নিতে পারব জানাবেন। ধন্যবাদ।`;
    const url = `https://wa.me/8801790828526?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="fixed inset-0 bg-slate-100 text-slate-900 flex flex-col overflow-hidden font-sans">
      <header className="bg-gradient-to-r from-blue-950 via-blue-900 to-red-900 text-white shadow-lg shrink-0 z-40 safe-top py-2.5 px-3 sm:px-5">
        <div className="max-w-5xl mx-auto space-y-1.5">
          <div className="flex justify-between items-center gap-1.5 sm:gap-2">
            <h1 className="text-[15px] sm:text-xl font-bold tracking-tight text-yellow-300 whitespace-nowrap shrink-0">
              ছাত্তার টেলিকম
            </h1>
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={onRefresh}
                disabled={isRefreshing}
                className="bg-white/15 hover:bg-white/25 active:scale-95 text-white p-2 rounded-2xl flex items-center justify-center gap-1.5 shadow transition-colors min-h-[38px] min-w-[38px] sm:min-h-[44px] sm:px-3"
                title="রিফ্রেশ করুন"
                aria-label="রিফ্রেশ করুন"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-yellow-300' : ''}`} />
                <span className="hidden sm:inline text-xs font-bold whitespace-nowrap">{isRefreshing ? 'রিফ্রেশ...' : 'রিফ্রেশ'}</span>
              </button>
              <a
                href="tel:01790828526"
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow transition-colors min-h-[38px] sm:min-h-[44px] whitespace-nowrap shrink-0"
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>কল করুন</span>
              </a>
              {user && (
                <button
                  onClick={onLogout}
                  disabled={isLoggingOut}
                  className="bg-red-700 hover:bg-red-800 active:scale-95 text-white px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow transition-colors min-h-[38px] sm:min-h-[44px] whitespace-nowrap shrink-0"
                >
                  <LogOut className="w-3.5 h-3.5 shrink-0" />
                  <span>{isLoggingOut ? '...' : 'লগআউট'}</span>
                </button>
              )}
            </div>
          </div>
          <div className="text-[11px] sm:text-xs text-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 leading-snug border-t border-white/15 pt-1.5">
            <span className="flex items-start sm:items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>দোকান নং-৩৮১, ইনডেক্স প্লাজা (৩য় তলা), বৌয়াকুড়, নরসিংদী</span>
            </span>
            <a href="tel:01790828526" className="flex items-center gap-1 text-yellow-300 font-semibold hover:underline whitespace-nowrap tabular-nums">
              <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>01790-828526</span>
            </a>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
        <main className="max-w-5xl w-full mx-auto px-3 sm:px-5 pt-4 pb-10 space-y-4">
        {!user ? (
          <div className="bg-white rounded-3xl p-5 sm:p-6 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <h2 className="font-bold text-base sm:text-lg text-blue-950">অর্ডার করতে Google দিয়ে লগইন করুন</h2>
              <p className="text-xs sm:text-sm text-slate-500">দোকানের আসল স্টক দেখতে ও হোয়াটসঅ্যাপে অর্ডার করতে লগইন প্রয়োজন</p>
              {authError && <p className="text-xs text-red-600 bg-red-50 p-2.5 rounded-2xl mt-2">{authError}</p>}
            </div>
            <button
              onClick={onGoogleLogin}
              className="w-full sm:w-auto shrink-0 bg-white hover:bg-slate-50 active:scale-[0.98] text-slate-900 font-bold py-3 px-5 rounded-2xl shadow-sm border border-slate-300 flex items-center justify-center gap-2.5 text-sm min-h-[48px] transition-all whitespace-nowrap"
            >
              <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"/>
                <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.13 0-5.78-2.11-6.73-4.96H1.18v3.15C3.15 21.32 7.22 24 12 24z"/>
                <path fill="#FBBC05" d="M5.27 14.24c-.25-.72-.38-1.49-.38-2.24s.13-1.52.38-2.24V6.61H1.18C.43 8.13 0 9.87 0 12s.43 3.87 1.18 5.39l4.09-3.15z"/>
                <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.22 0 3.15 2.68 1.18 6.61l4.09 3.15c.95-2.85 3.6-4.96 6.73-4.96z"/>
              </svg>
              <span>Google দিয়ে লগইন</span>
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-2xl px-4 py-2.5 shadow-sm border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-600">
            <div className="flex items-center gap-2 min-w-0">
              <User className="w-4 h-4 text-blue-900 shrink-0" />
              <span className="truncate font-medium">স্বাগতম, <strong className="text-slate-900">{user.displayName || user.email}</strong></span>
            </div>
            <span className="text-[11px] text-emerald-700 font-semibold shrink-0 whitespace-nowrap">ক্রেতা অ্যাকাউন্ট</span>
          </div>
        )}

        {/* Category Switch & Search Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
          <div className="flex rounded-2xl bg-slate-200 p-1">
            <button
              onClick={() => setCustomerTab('mobiles')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                customerTab === 'mobiles' ? 'bg-blue-900 text-white shadow' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-4 h-4 shrink-0" />
              <span>মোবাইল ({customerMobiles.length})</span>
            </button>
            <button
              onClick={() => setCustomerTab('gadgets')}
              className={`flex-1 py-2.5 px-3 rounded-xl text-xs sm:text-sm font-bold transition-all min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap ${
                customerTab === 'gadgets' ? 'bg-blue-900 text-white shadow' : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <Headphones className="w-4 h-4 shrink-0" />
              <span>গেজেট ({customerGadgets.length})</span>
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder={customerTab === 'mobiles' ? 'মোবাইল মডেল খুঁজুন...' : 'গেজেট খুঁজুন...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white pl-10 pr-10 py-2.5 rounded-2xl border border-slate-300 text-base shadow-sm min-h-[46px] focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch('')}
                aria-label="খোঁজা মুছুন"
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {customerTab === 'mobiles' ? (
          <div className="space-y-3.5">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {(['all', 'নতুন', 'ব্যবহৃত'] as const).map(c => (
                <button
                  key={c}
                  onClick={() => setFilterCond(c)}
                  className={`px-4 py-2 rounded-xl text-xs font-bold min-h-[40px] whitespace-nowrap shrink-0 transition-colors ${
                    filterCond === c ? 'bg-blue-900 text-white shadow-sm' : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {c === 'all' ? 'সব অবস্থা' : c}
                </button>
              ))}
            </div>

            {filteredMobiles.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 sm:p-10 text-center text-slate-500 shadow-sm border border-slate-200 space-y-2">
                <Package className="w-12 h-12 mx-auto text-slate-300" />
                <p className="font-bold text-base text-slate-700">এখন কোনো মোবাইল পাওয়া যায়নি</p>
                <p className="text-xs text-slate-400">
                  {!user ? 'দোকানের স্টক দেখতে উপরে Google দিয়ে লগইন করুন' : 'অন্য মডেল খুঁজে দেখুন অথবা সরাসরি কল করুন'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredMobiles.map((item: CatalogItem) => (
                  <div
                    key={item.id}
                    className={`bg-white rounded-3xl p-4 sm:p-5 shadow-sm border flex flex-col justify-between gap-4 ${
                      item.sold ? 'opacity-65 bg-slate-50 border-slate-200' : 'border-slate-200'
                    }`}
                  >
                    <div className="space-y-2.5">
                      <div className="flex justify-between items-start gap-3">
                        <div className="min-w-0 space-y-1">
                          <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-snug break-words">{item.title}</h3>
                          <div className="flex items-center gap-1.5 text-xs text-slate-600 flex-wrap">
                            {item.condition && <span className="font-semibold text-blue-900">{item.condition}</span>}
                            {item.condition && (item.ram || item.storage) && <span aria-hidden="true">·</span>}
                            {(item.ram || item.storage) && (
                              <span>{[item.ram, item.storage].filter(Boolean).join(' / ')}</span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-base sm:text-lg font-bold text-blue-900 tabular-nums whitespace-nowrap">
                            {item.price ? `৳${item.price.toLocaleString('en-US')}` : 'কল করুন'}
                          </p>
                          <p className={`text-[11px] font-bold mt-0.5 ${item.sold ? 'text-slate-500' : 'text-emerald-700'}`}>
                            {item.sold ? 'বিক্রি হয়ে গেছে' : 'স্টকে আছে ✓'}
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100">
                      <button
                        disabled={item.sold}
                        onClick={() => handleOrderWhatsApp(item)}
                        className={`w-full py-3 px-4 rounded-2xl font-bold text-sm flex items-center justify-center gap-2 shadow-sm min-h-[46px] active:scale-[0.98] transition-all ${
                          item.sold
                            ? 'bg-slate-200 text-slate-500 cursor-not-allowed'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                      >
                        <MessageCircle className="w-5 h-5 shrink-0" />
                        <span>{item.sold ? 'স্টক শেষ' : 'হোয়াটসঅ্যাপে অর্ডার করুন'}</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-3.5">
            {filteredGadgets.length === 0 ? (
              <div className="bg-white rounded-3xl p-8 sm:p-10 text-center text-slate-500 shadow-sm border border-slate-200 space-y-2">
                <Headphones className="w-12 h-12 mx-auto text-slate-300" />
                <p className="font-bold text-base text-slate-700">এখন কোনো গেজেট পাওয়া যায়নি</p>
                <p className="text-xs text-slate-400">
                  {!user ? 'দোকানের স্টক দেখতে উপরে Google দিয়ে লগইন করুন' : 'অন্য নাম দিয়ে খুঁজে দেখুন'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                {filteredGadgets.map((item: CatalogItem) => (
                  <CustomerGadgetCard key={item.id} item={item} onOrder={handleOrderWhatsApp} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Store Footer Info */}
        <footer className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-600">
          <div className="space-y-1">
            <p className="font-bold text-sm text-blue-950">আঃ ছাত্তার টেলিকম</p>
            <p className="flex items-start gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-600 shrink-0 mt-0.5" />
              <span>দোকান নং-৩৮১, ইনডেক্স প্লাজা (৩য় তলা), বৌয়াকুড়, নরসিংদী</span>
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="tel:01790828526"
              className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-4 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap"
            >
              <Phone className="w-4 h-4 shrink-0" />
              <span className="tabular-nums">01790-828526</span>
            </a>
            <a
              href="https://wa.me/8801790828526"
              target="_blank"
              rel="noreferrer"
              className="flex-1 sm:flex-initial bg-blue-900 hover:bg-blue-800 text-white font-bold px-4 py-2.5 rounded-2xl flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap"
            >
              <MessageCircle className="w-4 h-4 shrink-0" />
              <span>হোয়াটসঅ্যাপ</span>
            </a>
          </div>
        </footer>
        </main>
      </div>
    </div>
  );
}

function CustomerGadgetCard({ item, onOrder }: { item: CatalogItem; onOrder: (item: CatalogItem, qty: number) => void }) {
  const [qtyToOrder, setQtyToOrder] = useState(1);
  const isOut = item.qty === 0;
  return (
    <div className={`bg-white rounded-3xl p-4 sm:p-5 shadow-sm border flex flex-col justify-between gap-4 ${isOut ? 'opacity-65 bg-slate-50 border-slate-200' : 'border-slate-200'}`}>
      <div className="flex justify-between items-start gap-3">
        <div className="min-w-0 space-y-1">
          <h3 className="font-bold text-base text-slate-900 leading-snug break-words">{item.title}</h3>
          <p className="text-xs">
            {isOut ? (
              <span className="text-red-600 font-bold">স্টক শেষ</span>
            ) : item.qty === 1 ? (
              <span className="text-amber-700 font-bold">মাত্র ১টি আছে!</span>
            ) : (
              <span className="text-emerald-700 font-bold tabular-nums">{item.qty} টি স্টকে আছে</span>
            )}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-base sm:text-lg font-bold text-blue-900 tabular-nums whitespace-nowrap">
            {item.price ? `৳${item.price.toLocaleString('en-US')}` : 'কল করুন'}
          </p>
        </div>
      </div>

      {!isOut && (
        <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2.5">
          <div className="flex items-center bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => setQtyToOrder(Math.max(1, qtyToOrder - 1))}
              aria-label="পরিমাণ কমান"
              className="px-3.5 py-2 font-bold text-base hover:bg-slate-200 active:bg-slate-300 min-h-[44px] min-w-[40px] flex items-center justify-center"
            >
              -
            </button>
            <span className="px-3 font-bold text-sm tabular-nums min-w-[28px] text-center">{qtyToOrder}</span>
            <button
              type="button"
              onClick={() => setQtyToOrder(Math.min(item.qty, qtyToOrder + 1))}
              aria-label="পরিমাণ বাড়ান"
              className="px-3.5 py-2 font-bold text-base hover:bg-slate-200 active:bg-slate-300 min-h-[44px] min-w-[40px] flex items-center justify-center"
            >
              +
            </button>
          </div>
          <button
            onClick={() => onOrder(item, qtyToOrder)}
            className="flex-1 bg-emerald-600 hover:bg-emerald-700 active:scale-[0.98] text-white py-3 px-3 rounded-2xl font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm min-h-[46px] transition-all whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>অর্ডার করুন</span>
          </button>
        </div>
      )}
    </div>
  );
}

// --- Staff View ---
function StaffView(props: any) {
  const {
    user, role, data, activeTab, setActiveTab, syncStatus,
    handleLogout, isLoggingOut, handleRefreshData, isRefreshing, syncCatalogFull, showToast,
    showMigrationPrompt, setShowMigrationPrompt, handleConfirmMigration,
    lastSaleSuccessModal, setLastSaleSuccessModal,
    showMobileModal, setShowMobileModal, editingMobile, setEditingMobile,
    showGadgetModal, setShowGadgetModal, editingGadget, setEditingGadget,
    showPartModal, setShowPartModal, editingPart, setEditingPart,
    sellingMobile, setSellingMobile, sellMobilePrice, setSellMobilePrice, sellMobileDate, setSellMobileDate,
    sellingGadget, setSellingGadget, sellGadgetQty, setSellGadgetQty, sellGadgetPrice, setSellGadgetPrice, sellGadgetDate, setSellGadgetDate
  } = props;

  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  return (
    <div className="fixed inset-0 bg-slate-100 text-slate-900 flex flex-col overflow-hidden font-sans">
      {showMigrationPrompt && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] sm:pb-6 shadow-2xl space-y-4 animate-slide-up">
            <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
            <h3 className="font-bold text-lg text-slate-900">পুরনো ডাটা পাওয়া গেছে!</h3>
            <p className="text-sm text-slate-600 leading-relaxed">আপনার আগের লোকাল ডাটা নতুন শেয়ার্ড দোকানে (Firestore) সরিয়ে নিতে চান?</p>
            <div className="flex gap-2.5 pt-1">
              <button onClick={() => { localStorage.removeItem(LOCAL_STORAGE_KEY); setShowMigrationPrompt(false); }} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold py-3 rounded-2xl text-sm min-h-[44px]">বাদ দিন</button>
              <button onClick={handleConfirmMigration} className="flex-1 bg-blue-900 hover:bg-blue-800 text-white font-bold py-3 rounded-2xl text-sm shadow min-h-[44px]">হ্যাঁ, সরিয়ে নিন ✓</button>
            </div>
          </div>
        </div>
      )}

      {lastSaleSuccessModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-sm rounded-t-3xl sm:rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] sm:pb-6 shadow-2xl text-center space-y-4 animate-slide-up">
            <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
              <Check className="w-8 h-8" />
            </div>
            <h3 className="text-xl font-bold text-slate-900">বিক্রি সফল হয়েছে!</h3>
            <p className="text-sm font-semibold text-slate-700">{lastSaleSuccessModal.text}</p>
            <div className={`p-3.5 rounded-2xl text-base font-bold tabular-nums ${lastSaleSuccessModal.profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
              {lastSaleSuccessModal.profit >= 0 ? '+' : ''}৳{lastSaleSuccessModal.profit.toLocaleString('en-US')} লাভ
            </div>
            <button onClick={() => setLastSaleSuccessModal(null)} className="w-full bg-blue-900 hover:bg-blue-800 text-white font-bold py-3.5 rounded-2xl text-sm shadow min-h-[48px]">ঠিক আছে</button>
          </div>
        </div>
      )}

      <header className="bg-gradient-to-r from-blue-950 via-blue-900 to-red-900 text-white shadow-lg shrink-0 z-40 safe-top py-2.5 px-3 sm:px-5">
        <div className="max-w-5xl mx-auto space-y-1.5">
          <div className="flex justify-between items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-2 shrink-0">
              <h1 className="text-[15px] sm:text-xl font-bold tracking-tight text-yellow-300 whitespace-nowrap">
                ছাত্তার টেলিকম
              </h1>
              <span className={`hidden sm:inline-flex text-[11px] font-bold px-2.5 py-0.5 rounded-full shrink-0 ${role === 'owner' ? 'bg-yellow-400 text-slate-950' : 'bg-emerald-500 text-white'}`}>
                {role === 'owner' ? 'মালিক' : 'এডমিন'}
              </span>
              <div className="hidden sm:flex items-center gap-1 bg-black/25 px-2 py-0.5 rounded-full text-[11px] font-medium shrink-0">
                {syncStatus === 'synced' && <Cloud className="w-3.5 h-3.5 text-emerald-400" />}
                {syncStatus === 'offline' && <CloudOff className="w-3.5 h-3.5 text-amber-400" />}
                {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin text-yellow-300" />}
                <span className="text-slate-200">{syncStatus === 'synced' ? 'সিঙ্ক' : syncStatus === 'offline' ? 'অফলাইন' : 'সিঙ্কিং'}</span>
              </div>
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              <button
                onClick={handleRefreshData}
                disabled={isRefreshing}
                className="bg-white/15 hover:bg-white/25 active:scale-95 text-white p-2 rounded-2xl text-xs font-bold flex items-center justify-center gap-1 shadow transition-colors min-h-[38px] min-w-[38px] sm:min-h-[44px] sm:px-3"
                title="ডাটা রিফ্রেশ করুন"
                aria-label="ডাটা রিফ্রেশ করুন"
              >
                <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-yellow-300' : ''}`} />
                <span className="hidden sm:inline whitespace-nowrap">{isRefreshing ? 'রিফ্রেশ...' : 'রিফ্রেশ'}</span>
              </button>
              <a
                href="tel:01790828526"
                className="bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow transition-colors min-h-[38px] sm:min-h-[44px] whitespace-nowrap shrink-0"
                title="01790-828526 নম্বরে কল করুন"
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span>কল করুন</span>
              </a>
              <button
                onClick={handleLogout}
                disabled={isLoggingOut}
                className="bg-red-700 hover:bg-red-800 active:scale-95 text-white px-2 sm:px-3.5 py-1.5 sm:py-2 rounded-2xl text-[11px] sm:text-xs font-bold flex items-center gap-1 shadow transition-colors min-h-[38px] sm:min-h-[44px] whitespace-nowrap shrink-0"
                title="লগআউট"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>{isLoggingOut ? '...' : 'লগআউট'}</span>
              </button>
            </div>
          </div>

          <div className="text-[11px] sm:text-xs text-slate-100 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 leading-snug border-t border-white/15 pt-1.5">
            <span className="flex items-start sm:items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5 sm:mt-0" />
              <span>দোকান নং-৩৮১, ইনডেক্স প্লাজা (৩য় তলা), বৌয়াকুড়, নরসিংদী</span>
            </span>
            <div className="flex items-center gap-2.5">
              <a href="tel:01790828526" className="flex items-center gap-1 text-yellow-300 font-semibold hover:underline whitespace-nowrap tabular-nums">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>01790-828526</span>
              </a>
              <span className={`sm:hidden text-[10px] font-bold px-2 py-0.5 rounded-full ${role === 'owner' ? 'bg-yellow-400 text-slate-950' : 'bg-emerald-500 text-white'}`}>
                {role === 'owner' ? 'মালিক' : 'এডমিন'}
              </span>
              <span className="sm:hidden inline-flex items-center gap-1 text-[10px] text-slate-200">
                {syncStatus === 'synced' && <Cloud className="w-3 h-3 text-emerald-400" />}
                {syncStatus === 'offline' && <CloudOff className="w-3 h-3 text-amber-400" />}
                {syncStatus === 'syncing' && <RefreshCw className="w-3 h-3 animate-spin text-yellow-300" />}
              </span>
            </div>
          </div>
        </div>
      </header>

      <div className="relative flex-1 min-h-0 flex flex-col">
        <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain">
          <main className="max-w-5xl w-full mx-auto px-3 sm:px-5 pt-4 pb-24">
            {activeTab === 'mobiles' && (
              <MobileManagementSection
                data={data}
                user={user}
                role={role}
                showToast={showToast}
                onOpenAdd={() => { setEditingMobile(null); setShowMobileModal(true); }}
                onEditMobile={(m: MobileItem) => { setEditingMobile(m); setShowMobileModal(true); }}
                onStartSell={(m: MobileItem) => { setSellingMobile(m); setSellMobilePrice(m.salePrice ? m.salePrice.toString() : m.purchasePrice.toString()); setSellMobileDate(getLocalDateStr()); }}
                onGoToAccounting={() => setActiveTab('accounting')}
              />
            )}

            {activeTab === 'gadgets' && (
              <GadgetManagementSection
                data={data}
                user={user}
                role={role}
                showToast={showToast}
                onOpenAdd={() => { setEditingGadget(null); setShowGadgetModal(true); }}
                onEditGadget={(g: GadgetItem) => { setEditingGadget(g); setShowGadgetModal(true); }}
                onStartSell={(g: GadgetItem) => { setSellingGadget(g); setSellGadgetQty('1'); setSellGadgetPrice(g.salePrice ? g.salePrice.toString() : Math.round(g.purchasePrice * 1.2).toString()); setSellGadgetDate(getLocalDateStr()); }}
              />
            )}

            {activeTab === 'parts' && (
              <PartsManagementSection
                data={data}
                user={user}
                role={role}
                showToast={showToast}
                onOpenAdd={() => { setEditingPart(null); setShowPartModal(true); }}
                onEditPart={(p: PartItem) => { setEditingPart(p); setShowPartModal(true); }}
              />
            )}

            {activeTab === 'accounting' && (
              <AccountingSection data={data} user={user} role={role} showToast={showToast} />
            )}

            {activeTab === 'manage' && (
              <ManageSection
                data={data}
                user={user}
                role={role}
                syncCatalogFull={syncCatalogFull}
                showToast={showToast}
              />
            )}
          </main>
        </div>

        {(activeTab === 'mobiles' || activeTab === 'gadgets' || activeTab === 'parts') && (
          <div className="absolute bottom-4 right-4 z-30">
            <button
              type="button"
              onClick={() => {
                if (activeTab === 'mobiles') { setEditingMobile(null); setShowMobileModal(true); }
                else if (activeTab === 'gadgets') { setEditingGadget(null); setShowGadgetModal(true); }
                else if (activeTab === 'parts') { setEditingPart(null); setShowPartModal(true); }
              }}
              className="bg-blue-900 hover:bg-blue-800 active:scale-95 transition-transform text-white px-4 py-3 rounded-full shadow-xl shadow-blue-950/30 flex items-center justify-center gap-2 border border-white/25 min-h-[48px]"
              aria-label="নতুন যোগ করুন"
            >
              <Plus className="w-5 h-5 shrink-0" />
              <span className="font-bold text-xs sm:text-sm whitespace-nowrap">
                {activeTab === 'mobiles' && 'নতুন মোবাইল'}
                {activeTab === 'gadgets' && 'নতুন গেজেট'}
                {activeTab === 'parts' && 'নতুন পার্টস'}
              </span>
            </button>
          </div>
        )}
      </div>

      <nav className="shrink-0 bg-white border-t border-slate-200 z-40 safe-bottom shadow-[0_-4px_16px_rgba(15,23,42,0.06)]">
        <div className="max-w-5xl mx-auto grid grid-cols-5 items-center h-16 px-1">
          <TabButton active={activeTab === 'mobiles'} onClick={() => setActiveTab('mobiles')} icon={<Smartphone className="w-5 h-5" />} label="মোবাইল" badge={data.mobiles.filter((m: MobileItem) => m.status === 'stock').length} />
          <TabButton active={activeTab === 'gadgets'} onClick={() => setActiveTab('gadgets')} icon={<Headphones className="w-5 h-5" />} label="গেজেট" badge={data.gadgets.reduce((acc: number, g: GadgetItem) => acc + g.quantity, 0)} />
          <TabButton active={activeTab === 'parts'} onClick={() => setActiveTab('parts')} icon={<Wrench className="w-5 h-5" />} label="পার্টস" badge={data.parts.reduce((acc: number, p: PartItem) => acc + p.quantity, 0)} />
          <TabButton active={activeTab === 'accounting'} onClick={() => setActiveTab('accounting')} icon={<BarChart3 className="w-5 h-5" />} label="হিসাব" />
          <TabButton active={activeTab === 'manage'} onClick={() => setActiveTab('manage')} icon={<Users className="w-5 h-5" />} label="ম্যানেজ" />
        </div>
      </nav>

      {showMobileModal && <MobileModal mobile={editingMobile} user={user} role={role} onClose={() => setShowMobileModal(false)} showToast={showToast} />}
      {showGadgetModal && <GadgetModal gadget={editingGadget} user={user} role={role} onClose={() => setShowGadgetModal(false)} showToast={showToast} />}
      {showPartModal && <PartModal part={editingPart} existingParts={data.parts} user={user} role={role} onClose={() => setShowPartModal(false)} showToast={showToast} />}
      {sellingMobile && <SellMobileModal mobile={sellingMobile} price={sellMobilePrice} setPrice={setSellMobilePrice} date={sellMobileDate} setDate={setSellMobileDate} user={user} role={role} onClose={() => setSellingMobile(null)} setLastSaleSuccessModal={setLastSaleSuccessModal} showToast={showToast} />}
      {sellingGadget && <SellGadgetModal gadget={sellingGadget} qty={sellGadgetQty} setQty={setSellGadgetQty} price={sellGadgetPrice} setPrice={setSellGadgetPrice} date={sellGadgetDate} setDate={setSellGadgetDate} user={user} role={role} onClose={() => setSellingGadget(null)} setLastSaleSuccessModal={setLastSaleSuccessModal} showToast={showToast} />}
    </div>
  );
}

// --- Tab Button ---
function TabButton({ active, onClick, icon, label, badge }: any) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center h-full py-1 transition-colors min-h-[44px] ${
        active ? 'text-blue-900 font-bold' : 'text-slate-500 hover:text-slate-700'
      }`}
    >
      <div className={`relative px-3 py-1 rounded-2xl transition-colors ${active ? 'bg-blue-100 text-blue-900' : ''}`}>
        {icon}
        {badge !== undefined && badge > 0 && (
          <span className="absolute -top-1 -right-1 bg-red-600 text-white text-[10px] font-bold px-1.5 leading-4 rounded-full min-w-[16px] text-center tabular-nums shadow-sm">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </div>
      <span className="text-[11px] mt-0.5 whitespace-nowrap">{label}</span>
    </button>
  );
}

// ==========================================
// MANAGEMENT SECTIONS (STAFF)
// ==========================================

function MobileManagementSection({ data, user, role, showToast, onOpenAdd, onEditMobile, onStartSell, onGoToAccounting }: any) {
  const confirm = useContext(ConfirmContext);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'stock' | 'sold'>('stock');

  const todayStr = getLocalDateStr();
  const stockMobiles = data.mobiles.filter((m: MobileItem) => m.status === 'stock');
  const stockGadgetsCount = data.gadgets.reduce((acc: number, g: GadgetItem) => acc + (g.quantity || 0), 0);
  const soldMobiles = data.mobiles.filter((m: MobileItem) => m.status === 'sold');
  const todaysSalesCount = data.sales.filter((s: SaleRecord) => s.date === todayStr).length;

  const filtered = data.mobiles.filter((m: MobileItem) => {
    const matches =
      m.model.toLowerCase().includes(search.toLowerCase()) ||
      (m.imei || '').toLowerCase().includes(search.toLowerCase());
    if (filterStatus === 'stock') return matches && m.status === 'stock';
    if (filterStatus === 'sold') return matches && m.status === 'sold';
    return matches;
  });

  const handleToggleShow = async (m: MobileItem) => {
    try {
      const nextVal = m.showToCustomers === false ? true : false;
      const batch = writeBatch(db);
      batch.set(doc(db, 'mobiles', m.id), { ...m, showToCustomers: nextVal, updatedBy: user.email, updatedAt: Date.now() }, { merge: true });
      batch.set(doc(db, 'catalog', m.id), { visible: nextVal, price: nextVal ? (m.salePrice || null) : null, updatedAt: Date.now() }, { merge: true });
      await batch.commit();
      showToast('কাস্টমার ভিউ আপডেট হয়েছে ✓');
    } catch (e) {
      showToast('আপডেট ব্যর্থ', true);
    }
  };

  const handleUndoSale = async (m: MobileItem) => {
    const ok = await confirm({
      title: 'বিক্রি বাতিল',
      message: 'এই মোবাইলটিকে আবার স্টকে ফেরত নিতে চান? (মালিক হলে বিক্রির হিসাবও মুছে যাবে)',
      confirmText: 'হ্যাঁ, ফেরত নিন'
    });
    if (!ok) return;
    try {
      const { sellingPrice: _sp, sellingDate: _sd, ...restMobile } = m;
      const batch = writeBatch(db);
      batch.set(doc(db, 'mobiles', m.id), {
        ...restMobile,
        status: 'stock',
        updatedBy: user.email,
        updatedAt: Date.now()
      });
      batch.set(doc(db, 'catalog', m.id), {
        qty: 1,
        sold: false,
        soldAt: null,
        updatedAt: Date.now()
      }, { merge: true });

      if (role === 'owner') {
        const matchingSales = data.sales.filter((s: SaleRecord) => s.type === 'mobile' && s.itemId === m.id);
        matchingSales.forEach((s: SaleRecord) => {
          batch.delete(doc(db, 'sales', s.id));
        });
      }

      const commitPromise = batch.commit();
      if (navigator.onLine) {
        await commitPromise;
      } else {
        commitPromise.catch(() => showToast('অফলাইন থেকে সিঙ্ক হতে সমস্যা হয়েছে', true));
      }
      showToast('বিক্রি বাতিল করে স্টকে ফেরত নেওয়া হয়েছে ✓');
    } catch (e) {
      showToast('বিক্রি বাতিল করতে সমস্যা হয়েছে', true);
    }
  };

  const handleDelete = async (m: MobileItem) => {
    let msg = 'স্থায়ীভাবে ডিলিট করতে চান?';
    if (m.status === 'sold') {
      msg = 'বিক্রিত মোবাইলটি স্টক থেকে মুছতে চান? (হিসাবের রেকর্ড আলাদা থাকবে)';
    }
    const ok = await confirm({ title: 'ডিলিট নিশ্চিতকরণ', message: msg, confirmText: 'ডিলিট করুন', isDanger: true });
    if (!ok) return;

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'mobiles', m.id));
      batch.delete(doc(db, 'catalog', m.id));
      await batch.commit();
      showToast('ডিলিট সফল');
    } catch (e) {
      showToast('ডিলিট ব্যর্থ (অনুমতি নেই)', true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2 sm:gap-2.5">
        <div className="bg-gradient-to-br from-blue-900 to-blue-950 text-white p-2.5 sm:p-4 rounded-2xl shadow-sm text-center flex flex-col justify-center">
          <p className="text-[11px] sm:text-xs text-blue-200">স্টকে আছে</p>
          <div className="mt-1 space-y-0.5 text-xs sm:text-sm font-bold tabular-nums leading-tight">
            <p className="whitespace-nowrap">মোবাইল: <span className="text-yellow-300">{stockMobiles.length}</span> টি</p>
            <p className="whitespace-nowrap">গেজেট: <span className="text-emerald-300">{stockGadgetsCount}</span> টি</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onGoToAccounting}
          title="আজকের বিক্রির তালিকা দেখতে ও ডিলিট করতে ক্লিক করুন"
          className="bg-gradient-to-br from-emerald-800 to-emerald-950 hover:from-emerald-700 hover:to-emerald-900 active:scale-[0.98] transition-all text-white p-2.5 sm:p-4 rounded-2xl shadow-sm text-center cursor-pointer flex flex-col justify-center"
        >
          <p className="text-[11px] sm:text-xs text-emerald-200 underline decoration-emerald-400/60 underline-offset-2">আজ বিক্রি</p>
          <p className="text-lg sm:text-2xl font-bold mt-0.5 text-yellow-300 tabular-nums">{todaysSalesCount} টি</p>
        </button>
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white p-2.5 sm:p-4 rounded-2xl shadow-sm text-center flex flex-col justify-center">
          <p className="text-[11px] sm:text-xs text-slate-300">মোট বিক্রিত</p>
          <p className="text-lg sm:text-2xl font-bold mt-0.5 tabular-nums">{soldMobiles.length} টি</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 items-center">
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            placeholder="মডেল বা IMEI দিয়ে খুঁজুন..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full bg-white pl-10 pr-10 py-2.5 rounded-2xl border border-slate-300 text-base shadow-sm min-h-[46px] focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="খোঁজা মুছুন"
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <div className="flex rounded-2xl bg-slate-200 p-1">
          <button onClick={() => setFilterStatus('stock')} className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold min-h-[40px] whitespace-nowrap transition-all ${filterStatus === 'stock' ? 'bg-blue-900 text-white shadow' : 'text-slate-700'}`}>স্টকে ({stockMobiles.length})</button>
          <button onClick={() => setFilterStatus('sold')} className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold min-h-[40px] whitespace-nowrap transition-all ${filterStatus === 'sold' ? 'bg-blue-900 text-white shadow' : 'text-slate-700'}`}>বিক্রিত ({soldMobiles.length})</button>
          <button onClick={() => setFilterStatus('all')} className={`flex-1 py-2 px-2 rounded-xl text-xs font-bold min-h-[40px] whitespace-nowrap transition-all ${filterStatus === 'all' ? 'bg-blue-900 text-white shadow' : 'text-slate-700'}`}>সব ({data.mobiles.length})</button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center text-slate-500 shadow-sm border border-slate-200 space-y-3">
          <Smartphone className="w-11 h-11 mx-auto text-slate-300" />
          <p className="font-bold text-base text-slate-700">কোনো মোবাইল পাওয়া যায়নি</p>
          <button
            onClick={onOpenAdd}
            className="inline-flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-2xl text-xs font-bold min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> নতুন মোবাইল যোগ করুন
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((m: MobileItem) => (
            <div key={m.id} className={`bg-white rounded-3xl p-4 shadow-sm border flex flex-col justify-between gap-3 ${m.status === 'sold' ? 'border-emerald-200 bg-emerald-50/20' : 'border-slate-200'}`}>
              <div className="space-y-2">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-bold text-base sm:text-lg text-slate-900 leading-snug break-words">{m.model}</h3>
                    <div className="text-xs text-slate-600 flex items-center gap-1.5 flex-wrap">
                      <span className="font-semibold text-slate-800">{m.condition}</span>
                      <span aria-hidden="true">·</span>
                      <span>{m.ram} / {m.storage}</span>
                      {m.status === 'sold' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-blue-900 font-bold">বিক্রিত ✓</span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-500">কেনা দাম</p>
                    <p className="text-base font-bold text-blue-900 tabular-nums whitespace-nowrap">৳{m.purchasePrice.toLocaleString('en-US')}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600">
                  {m.salePrice !== undefined && (
                    <span className="text-emerald-700 font-semibold tabular-nums">
                      কাস্টমার দাম: ৳{m.salePrice.toLocaleString('en-US')}
                    </span>
                  )}
                  {m.status === 'sold' && m.sellingPrice !== undefined && (
                    <span className="text-blue-900 font-semibold tabular-nums">
                      বিক্রি: ৳{m.sellingPrice.toLocaleString('en-US')} ({m.sellingDate})
                    </span>
                  )}
                  {m.imei && <span className="font-mono text-[11px] text-slate-500">IMEI: {m.imei}</span>}
                </div>
                {m.note && <p className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl">{m.note}</p>}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleToggleShow(m)}
                  className={`text-xs px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 min-h-[40px] whitespace-nowrap transition-colors ${
                    m.showToCustomers !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {m.showToCustomers !== false ? <Eye className="w-4 h-4 shrink-0" /> : <EyeOff className="w-4 h-4 shrink-0" />}
                  <span>{m.showToCustomers !== false ? 'দৃশ্যমান' : 'লুকানো'}</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  {m.status === 'stock' ? (
                    <>
                      <button onClick={() => onStartSell(m)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-2xl text-xs font-bold flex items-center gap-1 min-h-[40px] whitespace-nowrap">
                        <DollarSign className="w-3.5 h-3.5 shrink-0" /> বিক্রি
                      </button>
                      <button onClick={() => onEditMobile(m)} aria-label="এডিট" className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Edit className="w-4 h-4" /></button>
                      <button onClick={() => handleDelete(m)} aria-label="ডিলিট" className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => handleUndoSale(m)} className="bg-amber-100 hover:bg-amber-200 text-amber-800 px-3 py-2 rounded-2xl text-xs font-bold min-h-[40px] whitespace-nowrap">বিক্রি বাতিল</button>
                      <button onClick={() => handleDelete(m)} aria-label="ডিলিট" className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function GadgetManagementSection({ data, user, showToast, onOpenAdd, onEditGadget, onStartSell }: any) {
  const confirm = useContext(ConfirmContext);
  const [search, setSearch] = useState('');
  const filtered = data.gadgets.filter((g: GadgetItem) =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.type || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleToggleShow = async (g: GadgetItem) => {
    try {
      const nextVal = g.showToCustomers !== false ? false : true;
      const batch = writeBatch(db);
      batch.set(doc(db, 'gadgets', g.id), { ...g, showToCustomers: nextVal, updatedBy: user.email, updatedAt: Date.now() }, { merge: true });
      batch.set(doc(db, 'catalog', g.id), { visible: nextVal, price: nextVal ? (g.salePrice || null) : null, updatedAt: Date.now() }, { merge: true });
      await batch.commit();
      showToast('কাস্টমার ভিউ আপডেট হয়েছে');
    } catch (e) {
      showToast('আপডেট ব্যর্থ', true);
    }
  };

  const handleDelete = async (g: GadgetItem) => {
    const ok = await confirm({ title: 'ডিলিট', message: 'এই গেজেট আইটেমটি ডিলিট করতে চান?', confirmText: 'ডিলিট', isDanger: true });
    if (!ok) return;
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'gadgets', g.id));
      batch.delete(doc(db, 'catalog', g.id));
      await batch.commit();
      showToast('ডিলিট সফল');
    } catch (e) {
      showToast('অনুমতি নেই', true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="গেজেট খুঁজুন..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white pl-10 pr-10 py-2.5 rounded-2xl border border-slate-300 text-base shadow-sm min-h-[46px] focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="খোঁজা মুছুন"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center text-slate-500 shadow-sm border border-slate-200 space-y-3">
          <Headphones className="w-11 h-11 mx-auto text-slate-300" />
          <p className="font-bold text-base text-slate-700">কোনো গেজেট পাওয়া যায়নি</p>
          <button
            onClick={onOpenAdd}
            className="inline-flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-2xl text-xs font-bold min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> নতুন গেজেট যোগ করুন
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((g: GadgetItem) => (
            <div key={g.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <div className="flex justify-between items-start gap-3">
                  <div className="min-w-0">
                    <h3 className="font-bold text-base text-slate-900 leading-snug break-words">{g.name}</h3>
                    <div className="text-xs text-slate-600 mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 tabular-nums">
                      <span>{g.type}</span>
                      <span aria-hidden="true">·</span>
                      <span className={`font-bold ${g.quantity === 0 ? 'text-red-600' : 'text-slate-800'}`}>{g.quantity} টি</span>
                      <span aria-hidden="true">·</span>
                      <span>কেনা: ৳{g.purchasePrice.toLocaleString('en-US')}</span>
                      {g.salePrice ? (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-emerald-700 font-semibold">দাম: ৳{g.salePrice.toLocaleString('en-US')}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-[11px] text-slate-500">মোট মূল্য</p>
                    <p className="text-base font-bold text-blue-900 tabular-nums whitespace-nowrap">
                      ৳{(g.purchasePrice * g.quantity).toLocaleString('en-US')}
                    </p>
                  </div>
                </div>
                {g.note && <p className="text-xs text-slate-500 bg-slate-50 px-3 py-1.5 rounded-xl">{g.note}</p>}
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-between items-center gap-2 flex-wrap">
                <button
                  onClick={() => handleToggleShow(g)}
                  className={`text-xs px-3 py-2 rounded-xl font-bold flex items-center gap-1.5 min-h-[40px] whitespace-nowrap ${
                    g.showToCustomers !== false ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {g.showToCustomers !== false ? <Eye className="w-4 h-4 shrink-0" /> : <EyeOff className="w-4 h-4 shrink-0" />}
                  <span>{g.showToCustomers !== false ? 'দৃশ্যমান' : 'লুকানো'}</span>
                </button>

                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    disabled={g.quantity === 0}
                    onClick={() => onStartSell(g)}
                    className={`px-3.5 py-2 rounded-2xl text-xs font-bold min-h-[40px] whitespace-nowrap ${
                      g.quantity === 0 ? 'bg-slate-200 text-slate-400 cursor-not-allowed' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                    }`}
                  >
                    বিক্রি
                  </button>
                  <button onClick={() => onEditGadget(g)} aria-label="এডিট" className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(g)} aria-label="ডিলিট" className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartsManagementSection({ data, user, showToast, onOpenAdd, onEditPart }: any) {
  const confirm = useContext(ConfirmContext);
  const [search, setSearch] = useState('');
  const filtered = data.parts.filter((p: PartItem) =>
    p.model.toLowerCase().includes(search.toLowerCase()) ||
    p.partType.toLowerCase().includes(search.toLowerCase()) ||
    (p.location || '').toLowerCase().includes(search.toLowerCase())
  );

  const handleUpdateQty = async (p: PartItem, delta: number) => {
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'parts', p.id), { ...p, quantity: Math.max(0, p.quantity + delta), updatedBy: user.email, updatedAt: Date.now() });
      await batch.commit();
    } catch (e) {
      showToast('ত্রুটি', true);
    }
  };

  const handleDelete = async (p: PartItem) => {
    const ok = await confirm({ title: 'ডিলিট', message: 'এই পার্টস এন্ট্রি ডিলিট করতে চান?', confirmText: 'ডিলিট', isDanger: true });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'parts', p.id));
      showToast('মুছে ফেলা হয়েছে');
    } catch (e) {
      showToast('অনুমতি নেই', true);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
        <input
          type="text"
          placeholder="মডেল, পার্টস বা ড্রয়ার খুঁজুন..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-white pl-10 pr-10 py-2.5 rounded-2xl border border-slate-300 text-base shadow-sm min-h-[46px] focus:outline-none focus:ring-2 focus:ring-blue-900/20 focus:border-blue-900"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            aria-label="খোঁজা মুছুন"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-slate-600 rounded-full min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-3xl p-8 text-center text-slate-500 shadow-sm border border-slate-200 space-y-3">
          <Wrench className="w-11 h-11 mx-auto text-slate-300" />
          <p className="font-bold text-base text-slate-700">কোনো পার্টস পাওয়া যায়নি</p>
          <button
            onClick={onOpenAdd}
            className="inline-flex items-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white px-4 py-2.5 rounded-2xl text-xs font-bold min-h-[44px]"
          >
            <Plus className="w-4 h-4" /> নতুন পার্টস যোগ করুন
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
          {filtered.map((p: PartItem) => (
            <div key={p.id} className="bg-white rounded-3xl p-4 shadow-sm border border-slate-200 flex flex-col justify-between gap-3">
              <div className="space-y-1.5">
                <h3 className="font-bold text-base text-slate-900 leading-snug break-words">
                  {p.model} — {p.partType}
                </h3>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <span className="inline-flex items-center gap-1 text-amber-900 bg-amber-100 px-2.5 py-1 rounded-xl font-semibold">
                    <MapPin className="w-3 h-3 shrink-0" /> {p.location}
                  </span>
                  {p.note && <span className="text-slate-500">{p.note}</span>}
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
                  <button onClick={() => handleUpdateQty(p, -1)} aria-label="পরিমাণ কমান" className="px-3.5 py-2 font-bold text-base hover:bg-slate-200 min-h-[40px] min-w-[40px] flex items-center justify-center">-</button>
                  <span className="px-3.5 font-bold text-sm tabular-nums">{p.quantity}</span>
                  <button onClick={() => handleUpdateQty(p, 1)} aria-label="পরিমাণ বাড়ান" className="px-3.5 py-2 font-bold text-base hover:bg-slate-200 min-h-[40px] min-w-[40px] flex items-center justify-center">+</button>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => onEditPart(p)} aria-label="এডিট" className="p-2.5 bg-slate-100 hover:bg-slate-200 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Edit className="w-4 h-4" /></button>
                  <button onClick={() => handleDelete(p)} aria-label="ডিলিট" className="p-2.5 bg-red-50 hover:bg-red-100 text-red-600 rounded-2xl min-h-[40px] min-w-[40px] flex items-center justify-center"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ==========================================
// MANAGE SECTION
// ==========================================
function ManageSection({ data, user, role, syncCatalogFull, showToast }: any) {
  const confirm = useContext(ConfirmContext);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [activityFilter, setActivityFilter] = useState<'all' | 'today' | string>('all');

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (role !== 'owner') return;
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      showToast('সঠিক ইমেইল দিন', true);
      return;
    }

    try {
      await setDoc(doc(db, 'admins', email), {
        addedBy: user.email,
        addedAt: Date.now()
      });
      setNewAdminEmail('');
      showToast('নতুন এডমিন যুক্ত হয়েছে ✓');
    } catch (e) {
      showToast('এডমিন যোগ করতে সমস্যা হয়েছে', true);
    }
  };

  const handleRemoveAdmin = async (email: string) => {
    const ok = await confirm({ title: 'এডমিন অপসারণ', message: `${email} কে এডমিন তালিকা থেকে সরাতে চান?`, confirmText: 'সরিয়ে দিন', isDanger: true });
    if (!ok) return;
    try {
      await deleteDoc(doc(db, 'admins', email));
      showToast('এডমিন অপসারণ করা হয়েছে');
    } catch (e) {
      showToast('ত্রুটি', true);
    }
  };

  const todayStr = getLocalDateStr();
  const filteredActivity = data.activity.filter((act: ActivityLog) => {
    if (activityFilter === 'today') {
      const actDate = getLocalDateStr(new Date(act.at?.toMillis?.() || act.at || Date.now()));
      return actDate === todayStr;
    }
    return true;
  });

  const handleDownloadJSON = () => {
    const payload = JSON.stringify(data, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const file = new File([blob], `satter_telecom_full_backup_${getLocalDateStr()}.json`, { type: 'application/json' });

    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      navigator.share({ title: 'Full Backup', files: [file] }).catch(() => {});
      return;
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `satter_telecom_backup_${getLocalDateStr()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('ডাটা ডাউনলোড হয়েছে ✓');
  };

  return (
    <div className="space-y-4 sm:space-y-5">
      {role === 'owner' && (
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-4">
          <div className="space-y-1">
            <h3 className="font-bold text-base text-blue-950 flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-900 shrink-0" /> এডমিন ব্যবস্থাপনা
            </h3>
            <p className="text-xs text-slate-500">এডমিনকে অবশ্যই Google দিয়ে লগইন করতে হবে। ইমেইলটি জিমেইলের হুবহু সঠিক লিখুন।</p>
          </div>

          <form onSubmit={handleAddAdmin} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="email"
              placeholder="admin@gmail.com"
              value={newAdminEmail}
              onChange={(e) => setNewAdminEmail(e.target.value)}
              className="flex-1 bg-slate-50 border border-slate-300 rounded-2xl px-4 py-3 text-base font-medium min-h-[46px]"
            />
            <button type="submit" className="bg-blue-900 hover:bg-blue-800 text-white font-bold px-5 py-3 rounded-2xl text-sm shadow min-h-[46px] whitespace-nowrap shrink-0">
              এডমিন বানাও
            </button>
          </form>

          <div className="space-y-2 pt-1">
            <p className="text-xs font-bold text-slate-700">বর্তমান এডমিনগণ ({data.admins.length}):</p>
            {data.admins.length === 0 ? (
              <p className="text-xs text-slate-400">কোনো এডমিন নেই</p>
            ) : (
              data.admins.map((adm: any) => (
                <div key={adm.email} className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center gap-2 text-xs border border-slate-100">
                  <span className="font-bold text-slate-800 truncate min-w-0">{adm.email}</span>
                  <button onClick={() => handleRemoveAdmin(adm.email)} className="text-red-600 hover:bg-red-50 px-3 py-1.5 rounded-xl font-bold min-h-[38px] whitespace-nowrap shrink-0">
                    সরিয়ে দাও
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="font-bold text-sm text-slate-900">কাস্টমার ক্যাটালগ সিঙ্ক</h4>
            <p className="text-xs text-slate-500">স্টকের সাথে কাস্টমার ভিউ আপডেট করুন</p>
          </div>
          <button onClick={syncCatalogFull} className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white px-4 py-3 rounded-2xl text-xs font-bold shadow min-h-[44px] flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0">
            <RefreshCw className="w-4 h-4 shrink-0" />
            <span>ক্যাটালগ সিঙ্ক করো</span>
          </button>
        </div>

        <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h4 className="font-bold text-sm text-slate-900">সম্পূর্ণ ডাটা ডাউনলোড (JSON)</h4>
            <p className="text-xs text-slate-500">নিরাপত্তার জন্য ব্যাকআপ ফাইল সেভ রাখুন</p>
          </div>
          <button onClick={handleDownloadJSON} className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-800 text-white px-4 py-3 rounded-2xl text-xs font-bold shadow flex items-center justify-center gap-1.5 min-h-[44px] whitespace-nowrap shrink-0">
            <Download className="w-4 h-4 shrink-0" />
            <span>ডাউনলোড</span>
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
        <div className="flex justify-between items-center flex-wrap gap-2">
          <h3 className="font-bold text-base text-blue-950 flex items-center gap-2">
            <Activity className="w-5 h-5 text-emerald-600 shrink-0" /> কার্যকলাপ লগ
          </h3>
          <div className="flex gap-1.5">
            <button onClick={() => setActivityFilter('all')} className={`px-3.5 py-2 rounded-xl text-xs font-bold min-h-[38px] ${activityFilter === 'all' ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>সব</button>
            <button onClick={() => setActivityFilter('today')} className={`px-3.5 py-2 rounded-xl text-xs font-bold min-h-[38px] ${activityFilter === 'today' ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>আজ</button>
          </div>
        </div>

        <div className="space-y-2 max-h-80 overflow-y-auto">
          {filteredActivity.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">কোনো কার্যকলাপ রেকর্ড নেই</p>
          ) : (
            filteredActivity.map((act: ActivityLog) => (
              <div key={act.id} className="bg-slate-50 p-3 rounded-2xl text-xs space-y-1 border border-slate-100">
                <div className="flex justify-between items-center gap-2 font-bold text-slate-800">
                  <span className="truncate">{act.byName || act.by} ({act.role === 'owner' ? 'মালিক' : 'এডমিন'})</span>
                  <span className="text-[11px] text-slate-400 shrink-0 tabular-nums">
                    {new Date(act.at?.toMillis?.() || act.at || Date.now()).toLocaleTimeString('bn-BD')}
                  </span>
                </div>
                <p className="text-slate-600">{act.action}: <strong className="text-slate-900">{act.itemName}</strong></p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ==========================================
// ACCOUNTING SECTION
// ==========================================
function AccountingSection({ data, user, role, showToast }: { data: AppData; user: FirebaseUser; role: 'owner' | 'admin' | 'customer' | null; showToast: (msg: string, isError?: boolean) => void }) {
  const confirm = useContext(ConfirmContext);
  const [selectedDate, setSelectedDate] = useState(getLocalDateStr());
  const [viewMode, setViewMode] = useState<'daily' | 'monthly'>('daily');
  const [deletingSaleId, setDeletingSaleId] = useState<string | null>(null);

  const daySales = [...data.sales]
    .filter((s: SaleRecord) => s.date === selectedDate)
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const totalDaySales = daySales.reduce((acc, s) => acc + s.sellingPrice, 0);
  const totalDayCost = daySales.reduce((acc, s) => acc + s.purchasePrice, 0);
  const netDayProfit = daySales.reduce((acc, s) => acc + s.profit, 0);

  const mobileDaySales = daySales.filter(s => s.type === 'mobile');
  const gadgetDaySales = daySales.filter(s => s.type === 'gadget');
  const mobileDayProfit = mobileDaySales.reduce((acc, s) => acc + s.profit, 0);
  const gadgetDayProfit = gadgetDaySales.reduce((acc, s) => acc + s.profit, 0);

  const currentYearMonth = selectedDate.substring(0, 7);
  const monthSales = [...data.sales]
    .filter((s: SaleRecord) => s.date.startsWith(currentYearMonth))
    .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  const totalMonthSales = monthSales.reduce((acc, s) => acc + s.sellingPrice, 0);
  const totalMonthCost = monthSales.reduce((acc, s) => acc + s.purchasePrice, 0);
  const netMonthProfit = monthSales.reduce((acc, s) => acc + s.profit, 0);

  const mobileStockVal = data.mobiles.filter((m: MobileItem) => m.status === 'stock').reduce((acc, m) => acc + m.purchasePrice, 0);
  const gadgetStockVal = data.gadgets.reduce((acc, g) => acc + (g.purchasePrice * g.quantity), 0);
  const totalStockValue = mobileStockVal + gadgetStockVal;

  const handleDeleteSale = async (sale: SaleRecord) => {
    if (role !== 'owner') {
      showToast('শুধুমাত্র মালিক বিক্রির রেকর্ড ডিলিট করতে পারবেন', true);
      return;
    }

    const relatedMobile = sale.type === 'mobile' ? data.mobiles.find(m => m.id === sale.itemId) : undefined;
    const relatedGadget = sale.type === 'gadget' ? data.gadgets.find(g => g.id === sale.itemId) : undefined;
    const willRestoreStock = (relatedMobile && relatedMobile.status === 'sold') || !!relatedGadget;

    const confirmMsg = willRestoreStock
      ? `"${sale.itemName}"-এর বিক্রির হিসাব (৳${sale.sellingPrice.toLocaleString('en-US')}) ডিলিট করতে চান? প্রোডাক্টটিও আবার স্টকে ফেরত যাবে।`
      : `"${sale.itemName}"-এর বিক্রির হিসাব (৳${sale.sellingPrice.toLocaleString('en-US')}) স্থায়ীভাবে ডিলিট করতে চান?`;

    const ok = await confirm({
      title: 'ভুল বিক্রি ডিলিট করুন',
      message: confirmMsg,
      confirmText: 'হ্যাঁ, ডিলিট করুন',
      isDanger: true
    });
    if (!ok) return;

    setDeletingSaleId(sale.id);
    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'sales', sale.id));

      if (relatedMobile && relatedMobile.status === 'sold') {
        const { sellingPrice: _sp, sellingDate: _sd, ...restMobile } = relatedMobile;
        batch.set(doc(db, 'mobiles', relatedMobile.id), {
          ...restMobile,
          status: 'stock',
          updatedBy: user.email || '',
          updatedAt: Date.now()
        });
        batch.set(doc(db, 'catalog', relatedMobile.id), {
          qty: 1,
          sold: false,
          soldAt: null,
          updatedAt: Date.now()
        }, { merge: true });
      } else if (relatedGadget) {
        const restoredQty = relatedGadget.quantity + (sale.quantity || 1);
        batch.set(doc(db, 'gadgets', relatedGadget.id), {
          ...relatedGadget,
          quantity: restoredQty,
          updatedBy: user.email || '',
          updatedAt: Date.now()
        });
        batch.set(doc(db, 'catalog', relatedGadget.id), {
          qty: restoredQty,
          sold: false,
          updatedAt: Date.now()
        }, { merge: true });
      }

      const actId = 'act_' + Date.now();
      batch.set(doc(db, 'activity', actId), {
        id: actId,
        by: user.email || '',
        byName: user.displayName || user.email || '',
        role: 'owner',
        action: willRestoreStock ? 'বিক্রি ডিলিট ও স্টকে ফেরত' : 'বিক্রির হিসাব ডিলিট',
        itemName: sale.itemName,
        amount: sale.sellingPrice,
        at: serverTimestamp()
      });

      const commitPromise = batch.commit();
      if (navigator.onLine) {
        await commitPromise;
      } else {
        commitPromise.catch(() => showToast('অফলাইনে ডিলিট হয়েছে, নেট এলে সিঙ্ক হবে', true));
      }

      showToast(willRestoreStock ? 'বিক্রি ডিলিট হয়েছে ও স্টকে ফেরত গেছে ✓' : 'বিক্রির হিসাব ডিলিট হয়েছে ✓');
    } catch (err: any) {
      showToast('ডিলিট করতে সমস্যা হয়েছে: ' + (err?.message || ''), true);
    } finally {
      setDeletingSaleId(null);
    }
  };

  const renderSaleRow = (s: SaleRecord, showDate: boolean = false) => (
    <div key={s.id} className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 flex justify-between items-center gap-2.5 text-xs">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="font-bold text-slate-900 text-sm break-words">{s.itemName}</p>
          <span className="text-[11px] text-slate-500 font-medium">
            ({s.type === 'mobile' ? 'মোবাইল' : 'গেজেট'})
          </span>
        </div>
        <p className="text-slate-500 tabular-nums">
          কেনা: ৳{s.purchasePrice.toLocaleString('en-US')} · বিক্রি: ৳{s.sellingPrice.toLocaleString('en-US')}
          {showDate ? ` · ${s.date}` : ''}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className={`font-bold text-sm tabular-nums ${s.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {s.profit >= 0 ? '+' : ''}৳{s.profit.toLocaleString('en-US')}
        </span>
        {role === 'owner' && (
          <button
            type="button"
            disabled={deletingSaleId === s.id}
            onClick={() => handleDeleteSale(s)}
            aria-label="বিক্রি ডিলিট করুন"
            title="ভুল বিক্রি ডিলিট করুন"
            className="p-2 bg-red-50 hover:bg-red-100 active:scale-95 text-red-600 rounded-xl min-h-[40px] min-w-[40px] flex items-center justify-center transition-all disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex rounded-2xl bg-slate-200 p-1">
        <button onClick={() => setViewMode('daily')} className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold min-h-[44px] transition-all ${viewMode === 'daily' ? 'bg-blue-900 text-white shadow' : 'text-slate-700'}`}>দৈনিক হিসাব</button>
        <button onClick={() => setViewMode('monthly')} className={`flex-1 py-2.5 rounded-xl text-xs sm:text-sm font-bold min-h-[44px] transition-all ${viewMode === 'monthly' ? 'bg-blue-900 text-white shadow' : 'text-slate-700'}`}>মাসিক সারাংশ</button>
      </div>

      {viewMode === 'daily' ? (
        <div className="space-y-4">
          <div className="bg-white rounded-3xl p-3.5 sm:p-4 shadow-sm border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label htmlFor="acc-date" className="text-xs font-bold text-slate-700 px-1 flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-blue-900" /> তারিখ নির্বাচন করুন
            </label>
            <input
              id="acc-date"
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-slate-50 border border-slate-300 rounded-2xl px-4 py-2.5 text-base font-bold text-slate-800 w-full sm:w-auto min-h-[44px]"
            />
          </div>

          <div className="bg-gradient-to-br from-blue-950 via-blue-900 to-indigo-950 text-white p-5 sm:p-6 rounded-3xl shadow-lg text-center space-y-3">
            <p className="text-xs text-blue-200 font-semibold tabular-nums">{selectedDate} — আজকের মোট নিট লাভ</p>
            <p className={`text-3xl sm:text-4xl font-extrabold tabular-nums ${netDayProfit >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {netDayProfit >= 0 ? '+' : ''}৳{netDayProfit.toLocaleString('en-US')}
            </p>
            <div className="pt-3 border-t border-blue-800/60 grid grid-cols-3 gap-2 text-xs text-slate-200 tabular-nums">
              <div>
                <p className="text-[11px] text-blue-300">বিক্রয়</p>
                <p className="font-bold">৳{totalDaySales.toLocaleString('en-US')}</p>
              </div>
              <div>
                <p className="text-[11px] text-blue-300">কেনা</p>
                <p className="font-bold">৳{totalDayCost.toLocaleString('en-US')}</p>
              </div>
              <div>
                <p className="text-[11px] text-blue-300">আইটেম</p>
                <p className="font-bold">{daySales.length} টি</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 space-y-1">
              <p className="text-xs font-bold text-blue-900">মোবাইল লাভ</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums ${mobileDayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {mobileDayProfit >= 0 ? '+' : ''}৳{mobileDayProfit.toLocaleString('en-US')}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">{mobileDaySales.length} টি বিক্রি</p>
            </div>
            <div className="bg-white p-4 rounded-3xl shadow-sm border border-slate-200 space-y-1">
              <p className="text-xs font-bold text-red-700">গেজেট লাভ</p>
              <p className={`text-lg sm:text-xl font-bold tabular-nums ${gadgetDayProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                {gadgetDayProfit >= 0 ? '+' : ''}৳{gadgetDayProfit.toLocaleString('en-US')}
              </p>
              <p className="text-[11px] text-slate-500 tabular-nums">{gadgetDaySales.length} টি বিক্রি</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
            <div className="flex justify-between items-center gap-2 border-b border-slate-100 pb-2">
              <h3 className="font-bold text-sm text-slate-900 tabular-nums">বিক্রির তালিকা ({daySales.length})</h3>
              {role === 'owner' && daySales.length > 0 && (
                <span className="text-[11px] text-slate-400">ডিলিট করতে লাল বাটনে চাপুন</span>
              )}
            </div>
            {daySales.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">এই তারিখে কোনো বিক্রি হয়নি</p>
            ) : (
              <div className="space-y-2.5">
                {daySales.map((s: SaleRecord) => renderSaleRow(s, false))}
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-gradient-to-br from-blue-900 to-indigo-950 text-white p-5 sm:p-6 rounded-3xl shadow-md space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-bold text-yellow-300 tabular-nums">মাসিক সারাংশ: {currentYearMonth}</h3>
              <span className="text-xs text-blue-200 tabular-nums">{monthSales.length} টি বিক্রি</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-3 border-t border-blue-800 tabular-nums">
              <div>
                <p className="text-xs text-blue-200">মোট বিক্রয়</p>
                <p className="text-2xl font-bold mt-1">৳{totalMonthSales.toLocaleString('en-US')}</p>
              </div>
              <div>
                <p className="text-xs text-blue-200">মোট কেনা খরচ</p>
                <p className="text-2xl font-bold mt-1 text-slate-200">৳{totalMonthCost.toLocaleString('en-US')}</p>
              </div>
              <div>
                <p className="text-xs text-blue-200">মোট নিট লাভ</p>
                <p className="text-2xl font-bold text-emerald-300 mt-1">৳{netMonthProfit.toLocaleString('en-US')}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-4 sm:p-5 shadow-sm border border-slate-200 space-y-3">
            <h3 className="font-bold text-sm text-slate-900 border-b border-slate-100 pb-2 tabular-nums">
              এই মাসের সব বিক্রি ({monthSales.length})
            </h3>
            {monthSales.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-6">এই মাসে কোনো বিক্রি হয়নি</p>
            ) : (
              <div className="space-y-2.5">
                {monthSales.map((s: SaleRecord) => renderSaleRow(s, true))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className="bg-gradient-to-r from-slate-800 to-slate-900 text-white p-4 sm:p-5 rounded-3xl shadow-md flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-slate-300">বর্তমান মোট স্টকের মূল্য (কেনা দামে)</p>
          <p className="text-2xl font-bold text-yellow-300 mt-0.5 tabular-nums">৳{totalStockValue.toLocaleString('en-US')}</p>
        </div>
        <Package className="w-10 h-10 text-blue-400 shrink-0" />
      </div>
    </div>
  );
}

// ==========================================
// MODALS FOR ADDING / EDITING WITH BATCH & ACTIVITY
// ==========================================

function MobileModal({ mobile, user, role, onClose, showToast }: any) {
  const [model, setModel] = useState(mobile ? mobile.model : '');
  const [ram, setRam] = useState(mobile ? mobile.ram : '6 GB');
  const [storage, setStorage] = useState(mobile ? mobile.storage : '128 GB');
  const [purchasePrice, setPurchasePrice] = useState(mobile ? mobile.purchasePrice.toString() : '');
  const [salePrice, setSalePrice] = useState(mobile?.salePrice ? mobile.salePrice.toString() : '');
  const [imei, setImei] = useState(mobile ? mobile.imei : '');
  const [condition, setCondition] = useState<'নতুন' | 'ব্যবহৃত' | 'মেরামত লাগবে'>(mobile ? mobile.condition : 'নতুন');
  const [note, setNote] = useState(mobile ? mobile.note : '');
  const [purchaseDate, setPurchaseDate] = useState(mobile ? mobile.purchaseDate : getLocalDateStr());
  const [showToCustomers, setShowToCustomers] = useState(mobile?.showToCustomers !== false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim() || !purchasePrice) {
      showToast('মডেল এবং কেনা দাম আবশ্যক!', true);
      return;
    }
    setIsSubmitting(true);

    const id = mobile ? mobile.id : 'mob_' + Date.now();
    const numericPurchase = Number(purchasePrice) || 0;
    const numericSale = salePrice ? Number(salePrice) || 0 : Math.round(numericPurchase * 1.2);

    const item: MobileItem = {
      id,
      model: model.trim(),
      ram,
      storage,
      purchasePrice: numericPurchase,
      salePrice: numericSale,
      imei: imei.trim(),
      condition,
      note: note.trim(),
      purchaseDate,
      status: mobile ? mobile.status : 'stock',
      showToCustomers,
      createdBy: mobile ? mobile.createdBy : user.email,
      updatedBy: user.email,
      updatedAt: Date.now()
    };

    const catalogItem: CatalogItem = {
      id,
      kind: 'mobile',
      title: item.model,
      ram: item.ram,
      storage: item.storage,
      condition: item.condition,
      price: showToCustomers ? numericSale : null,
      qty: item.status === 'stock' ? 1 : 0,
      sold: item.status === 'sold',
      visible: showToCustomers,
      updatedAt: Date.now()
    };

    const activity: ActivityLog = {
      id: 'act_' + Date.now(),
      by: user.email,
      byName: user.displayName || user.email,
      role: role === 'owner' ? 'owner' : 'admin',
      action: mobile ? 'মোবাইল আপডেট' : 'নতুন মোবাইল যোগ',
      itemName: item.model,
      amount: numericPurchase,
      at: serverTimestamp()
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'mobiles', id), item);
      batch.set(doc(db, 'catalog', id), catalogItem);
      batch.set(doc(db, 'activity', activity.id), activity);
      await batch.commit();

      showToast(mobile ? 'মোবাইল আপডেট হয়েছে ✓' : 'নতুন মোবাইল যোগ হয়েছে ✓');
      onClose();
    } catch (err: any) {
      showToast('সেভ করতে সমস্যা হয়েছে: ' + err.message, true);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl animate-slide-up">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">{mobile ? 'মোবাইল এডিট' : 'নতুন মোবাইল যোগ'}</h2>
            <button type="button" onClick={onClose} aria-label="বন্ধ করুন" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"><X className="w-5 h-5" /></button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">মডেল *</label>
              <input
                type="text"
                required
                placeholder="যেমন: Samsung A15"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">RAM (র‍্যাম)</label>
                <div className="flex flex-wrap gap-1.5">
                  {['2 GB', '4 GB', '6 GB', '8 GB', '12 GB'].map(r => (
                    <button key={r} type="button" onClick={() => setRam(r)} className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[40px] ${ram === r ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{r}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">Storage (স্টোরেজ)</label>
                <div className="flex flex-wrap gap-1.5">
                  {['64 GB', '128 GB', '256 GB', '512 GB'].map(s => (
                    <button key={s} type="button" onClick={() => setStorage(s)} className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[40px] ${storage === s ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{s}</button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কেনা দাম (৳) *</label>
                <input
                  type="number"
                  required
                  inputMode="numeric"
                  value={purchasePrice}
                  onChange={(e) => setPurchasePrice(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কাস্টমার দাম (৳)</label>
                <input
                  type="number"
                  inputMode="numeric"
                  value={salePrice}
                  onChange={(e) => setSalePrice(e.target.value)}
                  placeholder="খুচরা মূল্য"
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">অবস্থা</label>
              <div className="grid grid-cols-3 gap-2">
                {(['নতুন', 'ব্যবহৃত', 'মেরামত লাগবে'] as const).map(c => (
                  <button key={c} type="button" onClick={() => setCondition(c)} className={`py-2.5 px-2 rounded-2xl text-xs font-bold min-h-[44px] ${condition === c ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{c}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">IMEI নম্বর (ঐচ্ছিক)</label>
                <input
                  type="text"
                  placeholder="IMEI লিখুন"
                  value={imei}
                  onChange={(e) => setImei(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কেনার তারিখ</label>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(e) => setPurchaseDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">নোট (ঐচ্ছিক)</label>
              <input
                type="text"
                placeholder="বক্স, চার্জার বা অন্যান্য তথ্য"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium"
              />
            </div>

            <label htmlFor="showCust" className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 cursor-pointer min-h-[48px]">
              <input
                type="checkbox"
                id="showCust"
                checked={showToCustomers}
                onChange={(e) => setShowToCustomers(e.target.checked)}
                className="w-5 h-5 accent-blue-900 rounded shrink-0"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-800">কাস্টমার ক্যাটালগে দেখাও</span>
            </label>
          </div>

          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] sm:pb-5 border-t border-slate-100 bg-white shrink-0">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full bg-blue-900 hover:bg-blue-800 active:scale-[0.99] text-white font-bold py-3.5 rounded-2xl shadow text-sm min-h-[48px] disabled:opacity-50 transition-all"
            >
              {isSubmitting ? 'সেভ হচ্ছে...' : 'সেভ করুন ✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function GadgetModal({ gadget, user, role, onClose, showToast }: any) {
  const [name, setName] = useState(gadget ? gadget.name : '');
  const [type, setType] = useState<GadgetItem['type']>(gadget ? gadget.type : 'স্পিকার');
  const [purchasePrice, setPurchasePrice] = useState(gadget ? gadget.purchasePrice.toString() : '');
  const [salePrice, setSalePrice] = useState(gadget?.salePrice ? gadget.salePrice.toString() : '');
  const [quantity, setQuantity] = useState(gadget ? gadget.quantity.toString() : '1');
  const [note, setNote] = useState(gadget ? gadget.note : '');
  const [showToCustomers, setShowToCustomers] = useState(gadget?.showToCustomers !== false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !purchasePrice) {
      showToast('নাম এবং দাম আবশ্যক!', true);
      return;
    }
    setIsSubmitting(true);

    const id = gadget ? gadget.id : 'gad_' + Date.now();
    const numericPurchase = Number(purchasePrice) || 0;
    const numericSale = salePrice ? Number(salePrice) || 0 : Math.round(numericPurchase * 1.2);
    const qtyNum = Math.max(0, Number(quantity) || 1);

    const item: GadgetItem = {
      id,
      name: name.trim(),
      type,
      purchasePrice: numericPurchase,
      salePrice: numericSale,
      quantity: qtyNum,
      note: note.trim(),
      purchaseDate: gadget ? gadget.purchaseDate : getLocalDateStr(),
      showToCustomers,
      createdBy: gadget ? gadget.createdBy : user.email,
      updatedBy: user.email,
      updatedAt: Date.now()
    };

    const catalogItem: CatalogItem = {
      id,
      kind: 'gadget',
      title: item.name,
      price: showToCustomers ? numericSale : null,
      qty: qtyNum,
      sold: qtyNum === 0,
      visible: showToCustomers,
      updatedAt: Date.now()
    };

    const activity: ActivityLog = {
      id: 'act_' + Date.now(),
      by: user.email,
      byName: user.displayName || user.email,
      role: role === 'owner' ? 'owner' : 'admin',
      action: gadget ? 'গেজেট আপডেট' : 'নতুন গেজেট যোগ',
      itemName: item.name,
      amount: numericPurchase * qtyNum,
      at: serverTimestamp()
    };

    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'gadgets', id), item);
      batch.set(doc(db, 'catalog', id), catalogItem);
      batch.set(doc(db, 'activity', activity.id), activity);
      await batch.commit();

      showToast('গেজেট সেভ হয়েছে ✓');
      onClose();
    } catch (e) {
      showToast('ত্রুটি', true);
      setIsSubmitting(false);
    }
  };

  const gadgetTypes: GadgetItem['type'][] = ['স্পিকার', 'ইয়ারবাড', 'স্মার্টওয়াচ', 'পাওয়ার ব্যাংক', 'চার্জার', 'অন্যান্য'];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl animate-slide-up">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">{gadget ? 'গেজেট এডিট' : 'নতুন গেজেট যোগ'}</h2>
            <button type="button" onClick={onClose} aria-label="বন্ধ করুন" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">গেজেটের নাম *</label>
              <input type="text" required placeholder="যেমন: Oraimo FreePods 4" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">ধরন</label>
              <div className="flex flex-wrap gap-1.5">
                {gadgetTypes.map(t => (
                  <button key={t} type="button" onClick={() => setType(t)} className={`px-3 py-2 rounded-xl text-xs font-bold min-h-[40px] ${type === t ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{t}</button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কেনা দাম (৳) *</label>
                <input type="number" required inputMode="numeric" placeholder="কেনা দাম" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কাস্টমার দাম (৳)</label>
                <input type="number" inputMode="numeric" placeholder="বিক্রি দাম" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums" />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">পরিমাণ (টি)</label>
                <input type="number" min="0" inputMode="numeric" placeholder="পরিমাণ" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">নোট (ঐচ্ছিক)</label>
                <input type="text" placeholder="ওয়ারেন্টি বা কালার" value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
              </div>
            </div>

            <label htmlFor="showGadgetCust" className="flex items-center gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200 cursor-pointer min-h-[48px]">
              <input
                type="checkbox"
                id="showGadgetCust"
                checked={showToCustomers}
                onChange={(e) => setShowToCustomers(e.target.checked)}
                className="w-5 h-5 accent-blue-900 rounded shrink-0"
              />
              <span className="text-xs sm:text-sm font-bold text-slate-800">কাস্টমার ক্যাটালগে দেখাও</span>
            </label>
          </div>

          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] sm:pb-5 border-t border-slate-100 bg-white shrink-0">
            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-900 hover:bg-blue-800 active:scale-[0.99] text-white font-bold py-3.5 rounded-2xl shadow text-sm min-h-[48px] disabled:opacity-50 transition-all">
              {isSubmitting ? 'সেভ হচ্ছে...' : 'সেভ করুন ✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function PartModal({ part, user, onClose, showToast }: any) {
  const [model, setModel] = useState(part ? part.model : '');
  const [partType, setPartType] = useState(part ? part.partType : 'ডিসপ্লে');
  const [quantity, setQuantity] = useState(part ? part.quantity.toString() : '1');
  const [location, setLocation] = useState(part ? part.location : 'ড্রয়ার ১');
  const [note, setNote] = useState(part ? part.note : '');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim() || !partType.trim() || !location.trim()) {
      showToast('মডেল, পার্টসের ধরন ও ড্রয়ার লিখুন!', true);
      return;
    }
    setIsSubmitting(true);
    const id = part ? part.id : 'part_' + Date.now();
    const item: PartItem = {
      id,
      model: model.trim(),
      partType: partType.trim(),
      quantity: Math.max(0, Number(quantity) || 1),
      location: location.trim(),
      note: note.trim(),
      createdBy: part ? part.createdBy : user.email,
      updatedBy: user.email,
      updatedAt: Date.now()
    };
    try {
      const batch = writeBatch(db);
      batch.set(doc(db, 'parts', id), item);
      await batch.commit();
      showToast('পার্টস সেভ হয়েছে ✓');
      onClose();
    } catch (e) {
      showToast('ত্রুটি', true);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[90dvh] flex flex-col overflow-hidden shadow-2xl animate-slide-up">
        <div className="px-5 pt-4 pb-3 border-b border-slate-100 shrink-0 space-y-2">
          <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-900">{part ? 'পার্টস এডিট' : 'নতুন পার্টস যোগ'}</h2>
            <button type="button" onClick={onClose} aria-label="বন্ধ করুন" className="p-2 bg-slate-100 hover:bg-slate-200 rounded-full min-h-[44px] min-w-[44px] flex items-center justify-center"><X className="w-5 h-5" /></button>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="overflow-y-auto flex-1 px-5 py-4 space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">মোবাইল মডেল *</label>
              <input type="text" required placeholder="যেমন: Redmi Note 11" value={model} onChange={(e) => setModel(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">পার্টসের ধরন *</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {['ডিসপ্লে', 'ব্যাটারি', 'চার্জিং পোর্ট', 'ক্যামেরা', 'স্পিকার'].map(t => (
                  <button key={t} type="button" onClick={() => setPartType(t)} className={`px-3 py-1.5 rounded-xl text-xs font-bold min-h-[36px] ${partType === t ? 'bg-blue-900 text-white' : 'bg-slate-100 text-slate-700'}`}>{t}</button>
                ))}
              </div>
              <input type="text" required placeholder="অথবা নিজে লিখুন" value={partType} onChange={(e) => setPartType(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">কোথায় রাখা আছে *</label>
                <input type="text" required placeholder="ড্রয়ার ১" value={location} onChange={(e) => setLocation(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">পরিমাণ (টি)</label>
                <input type="number" min="0" inputMode="numeric" placeholder="পরিমাণ" value={quantity} onChange={(e) => setQuantity(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium tabular-nums" />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">নোট (ঐচ্ছিক)</label>
              <input type="text" placeholder="অরিজিনাল বা কোয়ালিটি নোট" value={note} onChange={(e) => setNote(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-medium" />
            </div>
          </div>

          <div className="px-5 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom,1.25rem))] sm:pb-5 border-t border-slate-100 bg-white shrink-0">
            <button type="submit" disabled={isSubmitting} className="w-full bg-blue-900 hover:bg-blue-800 active:scale-[0.99] text-white font-bold py-3.5 rounded-2xl shadow text-sm min-h-[48px] disabled:opacity-50 transition-all">
              {isSubmitting ? 'সেভ হচ্ছে...' : 'সেভ করুন ✓'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SellMobileModal({ mobile, price, setPrice, date, setDate, user, role, onClose, setLastSaleSuccessModal, showToast }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const numericPrice = Number(price) || 0;
  const profit = numericPrice - mobile.purchasePrice;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updatedMobile: MobileItem = {
        ...mobile,
        status: 'sold',
        sellingPrice: numericPrice,
        sellingDate: date,
        updatedBy: user.email,
        updatedAt: Date.now()
      };

      const saleRecord: SaleRecord = {
        id: 'sale_' + Date.now(),
        type: 'mobile',
        itemId: mobile.id,
        itemName: `${mobile.model} (${mobile.ram}/${mobile.storage})`,
        purchasePrice: mobile.purchasePrice,
        sellingPrice: numericPrice,
        quantity: 1,
        profit,
        date,
        soldBy: { email: user.email, name: user.displayName || user.email },
        timestamp: Date.now()
      };

      const catalogUpdate: Partial<CatalogItem> = {
        qty: 0,
        sold: true,
        soldAt: date,
        updatedAt: Date.now()
      };

      const activity: ActivityLog = {
        id: 'act_' + Date.now(),
        by: user.email,
        byName: user.displayName || user.email,
        role: role === 'owner' ? 'owner' : 'admin',
        action: 'মোবাইল বিক্রি',
        itemName: mobile.model,
        amount: numericPrice,
        at: serverTimestamp()
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'mobiles', mobile.id), updatedMobile);
      batch.set(doc(db, 'sales', saleRecord.id), saleRecord);
      batch.set(doc(db, 'catalog', mobile.id), catalogUpdate, { merge: true });
      batch.set(doc(db, 'activity', activity.id), activity);
      await batch.commit();

      onClose();
      setLastSaleSuccessModal({ text: `${mobile.model} বিক্রি সফল!`, profit });
    } catch (e) {
      showToast('বিক্রি সেভ ব্যর্থ', true);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] sm:pb-6 shadow-2xl space-y-4 animate-slide-up">
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
        <div className="space-y-1 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">মোবাইল বিক্রি কনফার্ম করুন</h2>
          <p className="text-xs text-slate-600 tabular-nums">
            {mobile.model} ({mobile.ram}/{mobile.storage}) · কেনা: ৳{mobile.purchasePrice.toLocaleString('en-US')}
          </p>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">বিক্রির দাম (৳)</label>
          <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-lg font-bold text-emerald-700 tabular-nums" />
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">বিক্রির তারিখ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base" />
        </div>

        <div className={`p-3 rounded-2xl text-sm font-bold text-center tabular-nums ${profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          {profit >= 0 ? `সম্ভাব্য লাভ: +৳${profit.toLocaleString('en-US')}` : `সম্ভাব্য লোকসান: -৳${Math.abs(profit).toLocaleString('en-US')}`}
        </div>

        <div className="flex gap-2.5 pt-1">
          <button onClick={onClose} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-3.5 rounded-2xl font-bold text-sm min-h-[46px]">বাতিল</button>
          <button onClick={handleConfirm} disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-bold text-sm min-h-[46px] disabled:opacity-50">
            {isSubmitting ? 'সেভ হচ্ছে...' : 'নিশ্চিত করুন ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}

function SellGadgetModal({ gadget, qty, setQty, price, setPrice, date, setDate, user, role, onClose, setLastSaleSuccessModal, showToast }: any) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const qtyNum = Math.min(gadget.quantity, Math.max(1, Number(qty) || 1));
  const unitPriceNum = Number(price) || 0;
  const totalSelling = qtyNum * unitPriceNum;
  const totalCost = qtyNum * gadget.purchasePrice;
  const profit = totalSelling - totalCost;

  const handleConfirm = async () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    try {
      const updatedGadget: GadgetItem = {
        ...gadget,
        quantity: gadget.quantity - qtyNum,
        updatedBy: user.email,
        updatedAt: Date.now()
      };

      const saleRecord: SaleRecord = {
        id: 'sale_' + Date.now(),
        type: 'gadget',
        itemId: gadget.id,
        itemName: `${gadget.name} (${qtyNum} টি)`,
        purchasePrice: totalCost,
        sellingPrice: totalSelling,
        quantity: qtyNum,
        profit,
        date,
        soldBy: { email: user.email, name: user.displayName || user.email },
        timestamp: Date.now()
      };

      const catalogUpdate: Partial<CatalogItem> = {
        qty: updatedGadget.quantity,
        sold: updatedGadget.quantity === 0,
        updatedAt: Date.now()
      };

      const activity: ActivityLog = {
        id: 'act_' + Date.now(),
        by: user.email,
        byName: user.displayName || user.email,
        role: role === 'owner' ? 'owner' : 'admin',
        action: 'গেজেট বিক্রি',
        itemName: gadget.name,
        amount: totalSelling,
        at: serverTimestamp()
      };

      const batch = writeBatch(db);
      batch.set(doc(db, 'gadgets', gadget.id), updatedGadget);
      batch.set(doc(db, 'sales', saleRecord.id), saleRecord);
      batch.set(doc(db, 'catalog', gadget.id), catalogUpdate, { merge: true });
      batch.set(doc(db, 'activity', activity.id), activity);
      await batch.commit();

      onClose();
      setLastSaleSuccessModal({ text: `${gadget.name} (${qtyNum} টি) বিক্রি সফল!`, profit });
    } catch (e) {
      showToast('ত্রুটি', true);
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 pb-[max(1.5rem,env(safe-area-inset-bottom,1.5rem))] sm:pb-6 shadow-2xl space-y-4 animate-slide-up">
        <div className="w-10 h-1.5 bg-slate-300 rounded-full mx-auto sm:hidden" aria-hidden="true" />
        <div className="space-y-1 border-b border-slate-100 pb-3">
          <h2 className="text-lg font-bold text-slate-900">গেজেট বিক্রি</h2>
          <p className="text-xs text-slate-600 tabular-nums">
            {gadget.name} · স্টক: {gadget.quantity} টি · কেনা: ৳{gadget.purchasePrice.toLocaleString('en-US')}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">পরিমাণ (সর্বোচ্চ {gadget.quantity})</label>
            <input type="number" min="1" max={gadget.quantity} inputMode="numeric" value={qty} onChange={(e) => setQty(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-bold tabular-nums" />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">প্রতি পিস দাম (৳)</label>
            <input type="number" inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base font-bold text-emerald-700 tabular-nums" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1.5">বিক্রির তারিখ</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-full bg-slate-50 border border-slate-300 rounded-2xl p-3.5 text-base" />
        </div>

        <div className={`p-3 rounded-2xl text-sm font-bold text-center tabular-nums ${profit >= 0 ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
          মোট: ৳{totalSelling.toLocaleString('en-US')} · {profit >= 0 ? `লাভ: +৳${profit.toLocaleString('en-US')}` : `লোকসান: -৳${Math.abs(profit).toLocaleString('en-US')}`}
        </div>

        <div className="flex gap-2.5 pt-1">
          <button onClick={onClose} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-3.5 rounded-2xl font-bold text-sm min-h-[46px]">বাতিল</button>
          <button onClick={handleConfirm} disabled={isSubmitting} className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-3.5 rounded-2xl font-bold text-sm min-h-[46px] disabled:opacity-50">
            {isSubmitting ? 'সেভ হচ্ছে...' : 'নিশ্চিত করুন ✓'}
          </button>
        </div>
      </div>
    </div>
  );
}
