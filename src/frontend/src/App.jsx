import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './App.css'
import AIPage from '../pages/AIPage'

function App() {
  const [count, setCount] = useState(0)

  return (
    <>
      <AIPage></AIPage>
    </>
  )
}

export default App
