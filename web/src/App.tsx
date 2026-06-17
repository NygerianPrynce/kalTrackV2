import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Dashboard from './pages/Dashboard'
import Trends from './pages/Trends'
import History from './pages/History'
import Settings from './pages/Settings'
import Dailies from './pages/Dailies'
import Workouts from './pages/Workouts'
import Layout from './components/Layout'

function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/dailies" element={<Dailies />} />
          <Route path="/workouts" element={<Workouts />} />
          <Route path="/trends" element={<Trends />} />
          <Route path="/history" element={<History />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  )
}

export default App
