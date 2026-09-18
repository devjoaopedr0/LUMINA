import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { Dashboard } from "@/pages/Dashboard";
import { SetPassword } from "@/pages/SetPassword";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { ConfirmEmail } from "@/pages/ConfirmEmail";
import { QuestionBank } from "@/pages/QuestionBank";
import { StudySchedulePage } from "@/pages/StudySchedulePage";
import { Profile } from "@/pages/Profile";
import { MentalMath } from "@/pages/MentalMath";
import { Essays } from "@/pages/Essays";
import { Simulations } from "@/pages/Simulations";
import { AiChatWidget } from "@/components/AiChatWidget";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/app/simulados" element={<ProtectedRoute><Simulations /></ProtectedRoute>} />
        <Route path="/app/redacoes" element={<ProtectedRoute><Essays /></ProtectedRoute>} />
        <Route path="/app/redacoes/:id" element={<ProtectedRoute><Essays /></ProtectedRoute>} />
        <Route path="/app/calculo-mental" element={<ProtectedRoute><MentalMath /></ProtectedRoute>} />
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/esqueci-senha" element={<ForgotPassword />} />
        <Route path="/redefinir-senha" element={<ResetPassword />} />
        <Route
          path="/confirmar-email"
          element={
            <ProtectedRoute>
              <ConfirmEmail />
            </ProtectedRoute>
          }
        />
        <Route
          path="/definir-senha"
          element={
            <ProtectedRoute>
              <SetPassword />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/questoes"
          element={
            <ProtectedRoute>
              <QuestionBank />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/perfil"
          element={
            <ProtectedRoute>
              <Profile />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/cronograma"
          element={
            <ProtectedRoute>
              <StudySchedulePage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <AiChatWidget />
    </AuthProvider>
  );
}

export default App;
