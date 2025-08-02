"use client";

import { Assistant } from "./assistant";
import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function AssistantPage() {
  return (
    <>
    <div className="h-dvh">
        <Assistant />
      </div>    
    </>
  );
}



