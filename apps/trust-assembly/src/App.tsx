import { BrowserRouter, Route, Routes } from "react-router-dom";
import Index from "./Index";
import Hello from "./Hello";
import './App.css'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Index />} />
        <Route path="/hello" element={<Hello />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
