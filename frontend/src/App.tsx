import { Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import Associazioni from "./pages/Associazioni";
import Home from "./pages/Home";

const App = () => {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Home />} />
        <Route path="associazioni" element={<Associazioni />} />
      </Route>
    </Routes>
  );
};

export default App;
