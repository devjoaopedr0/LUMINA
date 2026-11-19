import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";

import { ClassPresenceBar, RoomPresenceBar } from "@/components/groups/RoomPresenceBar";
import { GlobalNotificationBell } from "@/components/NotificationBell";

// Cada página vira um pedaço próprio do pacote: só baixa quando é aberta.
// O chat da LuminIA também (traz o KaTeX, que desenha as fórmulas).
const AiChatWidget = lazy(() => import("@/components/AiChatWidget").then((m) => ({ default: m.AiChatWidget })));
const RecoveryPlansPage = lazy(() => import("@/pages/RecoveryPlansPage").then((m) => ({ default: m.RecoveryPlansPage })));
const MaterialsPage = lazy(() => import("@/pages/MaterialsPage").then((m) => ({ default: m.MaterialsPage })));
const ReportsPage = lazy(() => import("@/pages/ReportsPage").then((m) => ({ default: m.ReportsPage })));
const Signup = lazy(() => import("@/pages/Signup").then((m) => ({ default: m.Signup })));
const LegalPage = lazy(() => import("@/pages/LegalPage").then((m) => ({ default: m.LegalPage })));
const Dashboard = lazy(() => import("@/pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const SetPassword = lazy(() => import("@/pages/SetPassword").then((m) => ({ default: m.SetPassword })));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword").then((m) => ({ default: m.ForgotPassword })));
const ResetPassword = lazy(() => import("@/pages/ResetPassword").then((m) => ({ default: m.ResetPassword })));
const ConfirmEmail = lazy(() => import("@/pages/ConfirmEmail").then((m) => ({ default: m.ConfirmEmail })));
const QuestionBank = lazy(() => import("@/pages/QuestionBank").then((m) => ({ default: m.QuestionBank })));
const ErrorNotebookPage = lazy(() => import("@/pages/ErrorNotebook").then((m) => ({ default: m.ErrorNotebookPage })));
const ReviewCenterPage = lazy(() => import("@/pages/ReviewCenterPage").then((m) => ({ default: m.ReviewCenterPage })));
const FlashcardsPage = lazy(() => import("@/pages/FlashcardsPage").then((m) => ({ default: m.FlashcardsPage })));
const WebQuestionSearch = lazy(() => import("@/pages/WebQuestionSearch").then((m) => ({ default: m.WebQuestionSearch })));
const StudySchedulePage = lazy(() => import("@/pages/StudySchedulePage").then((m) => ({ default: m.StudySchedulePage })));
const Profile = lazy(() => import("@/pages/Profile").then((m) => ({ default: m.Profile })));
const MentalMath = lazy(() => import("@/pages/MentalMath").then((m) => ({ default: m.MentalMath })));
const Essays = lazy(() => import("@/pages/Essays").then((m) => ({ default: m.Essays })));
const Simulations = lazy(() => import("@/pages/Simulations").then((m) => ({ default: m.Simulations })));
const AdaptiveSimulation = lazy(() => import("@/pages/AdaptiveSimulation").then((m) => ({ default: m.AdaptiveSimulation })));
const QuestionScanner = lazy(() => import("@/pages/QuestionScanner").then((m) => ({ default: m.QuestionScanner })));
const PastExams = lazy(() => import("@/pages/PastExams").then((m) => ({ default: m.PastExams })));
const FormulaNotebook = lazy(() => import("@/pages/FormulaNotebook").then((m) => ({ default: m.FormulaNotebook })));
const RepertoireNotebook = lazy(() => import("@/pages/RepertoireNotebook").then((m) => ({ default: m.RepertoireNotebook })));
const EssayModels = lazy(() => import("@/pages/EssayModels").then((m) => ({ default: m.EssayModels })));
const EssayScanner = lazy(() => import("@/pages/EssayScanner").then((m) => ({ default: m.EssayScanner })));
const AnswerSheetPrint = lazy(() => import("@/pages/AnswerSheetPrint").then((m) => ({ default: m.AnswerSheetPrint })));
const AnswerSheetScanner = lazy(() => import("@/pages/AnswerSheetScanner").then((m) => ({ default: m.AnswerSheetScanner })));
const Classes = lazy(() => import("@/pages/Classes").then((m) => ({ default: m.Classes })));
const TeacherAnalyticsPage = lazy(() => import("@/pages/TeacherAnalyticsPage").then((m) => ({ default: m.TeacherAnalyticsPage })));
const ClassInvite = lazy(() => import("@/pages/ClassInvite").then((m) => ({ default: m.ClassInvite })));
const SmartAnswerKey = lazy(() => import("@/pages/SmartAnswerKey").then((m) => ({ default: m.SmartAnswerKey })));
const SmartAnswerKeySheet = lazy(() => import("@/pages/SmartAnswerKeySheet").then((m) => ({ default: m.SmartAnswerKeySheet })));
const EssayReviewQueuePage = lazy(() => import("@/pages/EssayReviewQueuePage").then((m) => ({ default: m.EssayReviewQueuePage })));
const EssayReviewWorkspacePage = lazy(() => import("@/pages/EssayReviewWorkspacePage").then((m) => ({ default: m.EssayReviewWorkspacePage })));
const EssayReviewDivergencesPage = lazy(() => import("@/pages/EssayReviewDivergencesPage").then((m) => ({ default: m.EssayReviewDivergencesPage })));
const MasteryMap = lazy(() => import("@/pages/MasteryMap").then((m) => ({ default: m.MasteryMap })));
const PlanPage = lazy(() => import("@/pages/PlanPage").then((m) => ({ default: m.PlanPage })));
const Groups = lazy(() => import("@/pages/Groups").then((m) => ({ default: m.Groups })));
const GroupReportsAdmin = lazy(() => import("@/pages/GroupReportsAdmin").then((m) => ({ default: m.GroupReportsAdmin })));
const ComparePage = lazy(() => import("@/pages/ComparePage").then((m) => ({ default: m.ComparePage })));
const ClassRoomPage = lazy(() => import("@/pages/ClassRoomPage").then((m) => ({ default: m.ClassRoomPage })));


function App() {
  return (
    <AuthProvider>
      <Suspense fallback={<p role="status" className="p-8 text-sm text-graphite-500">Carregando…</p>}>
      <Routes>
        <Route path="/app/turmas" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
        <Route path="/app/turmas/:id/sala" element={<ProtectedRoute><ClassRoomPage /></ProtectedRoute>} />
        <Route path="/app/comparar" element={<ProtectedRoute><ComparePage /></ProtectedRoute>} />
        <Route path="/app/grupos" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/app/grupos/denuncias" element={<ProtectedRoute><GroupReportsAdmin /></ProtectedRoute>} />
        <Route path="/app/grupos/:id" element={<ProtectedRoute><Groups /></ProtectedRoute>} />
        <Route path="/app/acompanhamento" element={<ProtectedRoute><TeacherAnalyticsPage /></ProtectedRoute>} />
        <Route path="/app/recuperacao" element={<ProtectedRoute><RecoveryPlansPage /></ProtectedRoute>} />
        <Route path="/app/materiais" element={<ProtectedRoute><MaterialsPage /></ProtectedRoute>} />
        <Route path="/app/relatorios" element={<ProtectedRoute><ReportsPage /></ProtectedRoute>} />
        <Route path="/app/gabarito-inteligente" element={<ProtectedRoute><SmartAnswerKey /></ProtectedRoute>} />
        <Route path="/app/gabarito-inteligente/:id/cartao" element={<ProtectedRoute><SmartAnswerKeySheet /></ProtectedRoute>} />
        <Route path="/app/turmas/convite/:token" element={<ProtectedRoute><ClassInvite /></ProtectedRoute>} />
        <Route path="/app/simulados" element={<ProtectedRoute><Simulations /></ProtectedRoute>} />
        <Route path="/app/simulados/adaptativo" element={<ProtectedRoute><AdaptiveSimulation /></ProtectedRoute>} />
        <Route path="/app/question-scanner" element={<ProtectedRoute><QuestionScanner /></ProtectedRoute>} />
        <Route path="/app/busca-web" element={<ProtectedRoute><WebQuestionSearch /></ProtectedRoute>} />
        <Route path="/app/redacoes" element={<ProtectedRoute><Essays /></ProtectedRoute>} />
        <Route path="/app/redacoes/:id" element={<ProtectedRoute><Essays /></ProtectedRoute>} />
        <Route path="/app/redacoes/:id/revisao" element={<ProtectedRoute><EssayReviewWorkspacePage /></ProtectedRoute>} />
        <Route path="/app/revisoes" element={<ProtectedRoute><EssayReviewQueuePage /></ProtectedRoute>} />
        <Route path="/app/revisoes/divergencias" element={<ProtectedRoute><EssayReviewDivergencesPage /></ProtectedRoute>} />        <Route path="/app/redacoes/modelos" element={<ProtectedRoute><EssayModels /></ProtectedRoute>} />
        <Route path="/app/redacoes/scanner" element={<ProtectedRoute><EssayScanner /></ProtectedRoute>} />
        <Route path="/app/redacoes/scanner/:scanId" element={<ProtectedRoute><EssayScanner /></ProtectedRoute>} />
        <Route path="/app/calculo-mental" element={<ProtectedRoute><MentalMath /></ProtectedRoute>} />
        <Route path="/app/provas-antigas" element={<ProtectedRoute><PastExams /></ProtectedRoute>} />
        <Route path="/app/caderno-formulas" element={<ProtectedRoute><FormulaNotebook /></ProtectedRoute>} />
        <Route path="/app/caderno-repertorio" element={<ProtectedRoute><RepertoireNotebook /></ProtectedRoute>} />
        <Route path="/app/gabarito-scanner" element={<ProtectedRoute><AnswerSheetScanner /></ProtectedRoute>} />
        <Route path="/app/gabarito-scanner/imprimir/:simulationId" element={<ProtectedRoute><AnswerSheetPrint /></ProtectedRoute>} />
        <Route path="/" element={<Login />} />
        <Route path="/login" element={<Login />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/termos" element={<LegalPage slug="termos" />} />
        <Route path="/privacidade" element={<LegalPage slug="privacidade" />} />
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
          path="/app/caderno-de-erros"
          element={
            <ProtectedRoute>
              <ErrorNotebookPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/revisao-espacada"
          element={
            <ProtectedRoute>
              <ReviewCenterPage />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/flashcards"
          element={
            <ProtectedRoute>
              <FlashcardsPage />
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
        <Route
          path="/app/dominio"
          element={
            <ProtectedRoute>
              <MasteryMap />
            </ProtectedRoute>
          }
        />
        <Route
          path="/app/plano"
          element={
            <ProtectedRoute>
              <PlanPage />
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      </Suspense>
      <Suspense fallback={null}>
        <AiChatWidget />
      </Suspense>
      <GlobalNotificationBell />
      <RoomPresenceBar />
      <ClassPresenceBar />
    </AuthProvider>
  );
}

export default App;
