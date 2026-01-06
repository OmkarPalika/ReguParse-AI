import React, { createContext, useContext, useState, useCallback } from 'react';
import { Toast, ToastType } from './Toast';

interface ToastData {
    id: string;
    message: string;
    type: ToastType;
}

interface ToastContextType {
    addToast: (message: string, type: ToastType, id?: string) => string;
    removeToast: (id: string) => void;
    updateToast: (id: string, message: string, type: ToastType) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [toasts, setToasts] = useState<ToastData[]>([]);

    const addToast = useCallback((message: string, type: ToastType, id?: string) => {
        const newId = id || Math.random().toString(36).substr(2, 9);
        setToasts((prev) => [...prev, { id: newId, message, type }]);
        return newId;
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const updateToast = useCallback((id: string, message: string, type: ToastType) => {
        setToasts((prev) => prev.map((toast) =>
            toast.id === id ? { ...toast, message, type } : toast
        ));
    }, []);

    return (
        <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
            {children}
            <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-h-screen overflow-visible pointer-events-none">
                {toasts.map((toast) => (
                    <div key={toast.id} className="pointer-events-auto animate-in slide-in-from-right-full duration-300">
                        <Toast {...toast} onDismiss={removeToast} />
                    </div>
                ))}
            </div>
        </ToastContext.Provider>
    );
};

export const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
};
