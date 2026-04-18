"use client";

import "./styles.css";
import type { HadeSDKConfig, HadeSDKDecision } from "../core";
import { DecisionView } from "./DecisionView";

interface AppProps {
  config?: HadeSDKConfig;
  onGo?: (decision: HadeSDKDecision | null) => void;
}

export function App({ config, onGo }: AppProps) {
  return <DecisionView config={config} onGo={onGo} />;
}
