/** Amberline Cataclysm: no shell chrome competes with the full-screen tactical game. */
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import Home from "./pages/Home";

function App() {
  return <ErrorBoundary><Switch><Route path="/" component={Home} /><Route component={Home} /></Switch></ErrorBoundary>;
}

export default App;
