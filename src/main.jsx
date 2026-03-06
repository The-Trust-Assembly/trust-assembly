import React from "react";
import { createRoot } from "react-dom/client";
import TrustAssembly from "../trust-assembly-v5.jsx";

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <TrustAssembly />
  </React.StrictMode>
);
