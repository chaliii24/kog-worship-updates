"use client";

// Untitled UI — toast (notification) stack, themed to the KOG console.
// API mirrors the upstream demo:
//
//   const id = toast.add({ title, description, actionProps: { children, onClick } });
//   toast.close(id);
//
// Mount <Toaster /> ONCE (App.jsx) — it portals to <body>, sits above every
// modal (z-index 10050 vs the dialogs' 9999/10000) and colours itself from the
// app's --ui-* tokens, so it follows the OLED/light theme with no extra work.

import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, InfoCircle, X } from "@untitledui/icons";

export type ToastType = "success" | "info" | "error";

export interface ToastActionProps {
    children?: ReactNode;
    onClick?: () => void;
    [key: string]: unknown;
}

export interface ToastOptions {
    /** Bold first line. */
    title?: ReactNode;
    /** Softer second line — long sentences live here. */
    description?: ReactNode;
    /** success (green check) · info (violet) · error (red) — defaults to success. */
    type?: ToastType;
    /** Auto-dismiss in ms. 0 keeps it until dismissed. Default 4600. */
    duration?: number;
    /** Extra button (e.g. Undo). The toast closes itself after onClick runs. */
    actionProps?: ToastActionProps;
}

interface ToastItem extends ToastOptions {
    id: number;
}

let seq = 0;
let items: ToastItem[] = [];
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<(list: ToastItem[]) => void>();

const snapshot = () => [...items];
const emit = () => {
    for (const listener of listeners) listener(snapshot());
};

export const toast = {
    add(options: ToastOptions): number {
        // Keep the stack short — the oldest gives way instead of piling up.
        if (items.length >= 3) toast.close(items[0].id);
        const id = ++seq;
        items = [...items, { ...options, id }];
        emit();
        const duration = options.duration ?? 4600;
        if (duration > 0) timers.set(id, setTimeout(() => toast.close(id), duration));
        return id;
    },
    close(id: number) {
        const timer = timers.get(id);
        if (timer) {
            clearTimeout(timer);
            timers.delete(id);
        }
        const before = items.length;
        items = items.filter((item) => item.id !== id);
        if (items.length !== before) emit();
    },
    subscribe(listener: (list: ToastItem[]) => void) {
        listeners.add(listener);
        listener(snapshot());
        return () => {
            listeners.delete(listener);
        };
    },
};

const typeStyles: Record<ToastType, { icon: typeof Check; color: string }> = {
    success: { icon: Check, color: "#4ade80" },
    info: { icon: InfoCircle, color: "#a78bfa" },
    error: { icon: X, color: "#f87171" },
};

export const Toaster = () => {
    const [list, setList] = useState<ToastItem[]>([]);
    useEffect(() => toast.subscribe(setList), []);

    return (
        <div
            role="status"
            aria-live="polite"
            style={{
                position: "fixed",
                right: 16,
                bottom: 16,
                zIndex: 10050,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 10,
                pointerEvents: "none",
            }}
        >
            <AnimatePresence initial={false}>
                {list.map((item) => {
                    const { icon: Icon, color } = typeStyles[item.type ?? "success"];
                    return (
                        <motion.div
                            key={item.id}
                            initial={{ opacity: 0, y: 16, scale: 0.97 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: 10, scale: 0.97, transition: { duration: 0.15 } }}
                            transition={{ type: "spring", stiffness: 430, damping: 32 }}
                            style={{
                                pointerEvents: "auto",
                                boxSizing: "border-box",
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 10,
                                width: 340,
                                maxWidth: "calc(100vw - 32px)",
                                padding: "12px 13px",
                                borderRadius: 12,
                                background: "var(--ui-elev2, #1c1f2c)",
                                border: "1px solid var(--ui-border2, #222636)",
                                boxShadow: "0 18px 44px rgba(0,0,0,0.55)",
                                backdropFilter: "blur(10px)",
                            }}
                        >
                            <span
                                aria-hidden="true"
                                style={{
                                    flexShrink: 0,
                                    boxSizing: "border-box",
                                    width: 22,
                                    height: 22,
                                    borderRadius: 999,
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    color,
                                    background: `${color}1f`,
                                    border: `1px solid ${color}59`,
                                }}
                            >
                                <Icon className="shrink-0 size-3.5" />
                            </span>

                            <div style={{ flex: 1, minWidth: 0 }}>
                                {item.title != null && (
                                    <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.35, color: "var(--ui-text, #e2e8f0)" }}>
                                        {item.title}
                                    </div>
                                )}
                                {item.description != null && (
                                    <div style={{ fontSize: 12, lineHeight: 1.45, marginTop: 2, color: "var(--ui-muted, #64748b)" }}>
                                        {item.description}
                                    </div>
                                )}
                                {item.actionProps && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            item.actionProps?.onClick?.();
                                            toast.close(item.id);
                                        }}
                                        style={{
                                            marginTop: 9,
                                            background: "transparent",
                                            border: "none",
                                            padding: 0,
                                            cursor: "pointer",
                                            fontSize: 12,
                                            fontWeight: 800,
                                            letterSpacing: 0.2,
                                            color: "var(--color-fg-brand-secondary, #8b5cf6)",
                                        }}
                                    >
                                        {item.actionProps.children as ReactNode}
                                    </button>
                                )}
                            </div>

                            <button
                                type="button"
                                aria-label="Close"
                                onClick={() => toast.close(item.id)}
                                style={{
                                    flexShrink: 0,
                                    display: "flex",
                                    background: "transparent",
                                    border: "none",
                                    padding: 2,
                                    cursor: "pointer",
                                    color: "var(--ui-faint, #475569)",
                                }}
                            >
                                <X className="shrink-0 size-3.5" />
                            </button>
                        </motion.div>
                    );
                })}
            </AnimatePresence>
        </div>
    );
};
