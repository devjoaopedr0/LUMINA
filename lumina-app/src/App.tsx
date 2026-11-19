import { RecoveryPlansPage } from '@/pages/RecoveryPlansPage';
import { MaterialsPage } from '@/pages/MaterialsPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Login } from "@/pages/Login";
import { Signup } from "@/pages/Signup";
import { LegalPage } from "@/pages/LegalPage";
import { Dashboard } from "@/pages/Dashboard";
import { SetPassword } from "@/pages/SetPassword";
import { ForgotPassword } from "@/pages/ForgotPassword";
import { ResetPassword } from "@/pages/ResetPassword";
import { ConfirmEmail } from "@/pages/ConfirmEmail";
import { QuestionBank } from "@/pages/QuestionBank";
import { ErrorNotebookPage } from "@/pages/ErrorNotebook";
import { ReviewCenterPage } from "@/pages/ReviewCenterPage";
import { FlashcardsPage } from "@/pages/FlashcardsPage";
import { WebQuestionSearch } from "@/pages/WebQuestionSearch";
import { StudySchedulePage } from "@/pages/StudySchedulePage";
import { Profile } from "@/pages/Profile";
import { MentalMath } from "@/pages/MentalMath";
import { Essays } from "@/pages/Essays";
import { Simulations } from "@/pages/Simulations";
import { AdaptiveSimulation } from "@/pages/AdaptiveSimulation";
import { QuestionScanner } from "@/pages/QuestionScanner";
import { PastExams } from "@/pages/PastExams";
import { FormulaNotebook } from "@/pages/FormulaNotebook";
import { RepertoireNotebook } from "@/pages/RepertoireNotebook";
import { EssayModels } from "@/pages/EssayModels";
import { EssayScanner } from "@/pages/EssayScanner";
import { AnswerSheetPrint } from "@/pages/AnswerSheetPrint";
import { AnswerSheetScanner } from "@/pages/AnswerSheetScanner";
import { Classes } from "@/pages/Classes";
import { TeacherAnalyticsPage } from "@/pages/TeacherAnalyticsPage";
import { ClassInvite } from "@/pages/ClassInvite";
import { SmartAnswerKey } from "@/pages/SmartAnswerKey";
import { SmartAnswerKeySheet } from "@/pages/SmartAnswerKeySheet";
import { EssayReviewQueuePage } from "@/pages/EssayReviewQueuePage";
import { EssayReviewWorkspacePage } from "@/pages/EssayReviewWorkspacePage";
import { EssayReviewDivergencesPage } from "@/pages/EssayReviewDivergencesPage";
import { MasteryMap } from "@/pages/MasteryMap";
import { PlanPage } from "@/pages/PlanPage";
import { Groups } from "@/pages/Groups";
import { GroupReportsAdmin } from "@/pages/GroupReportsAdmin";
import { AiChatWidget } from "@/components/AiChatWidget";
import { RoomPresenceBar } from "@/components/groups/RoomPresenceBar";

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/app/turmas" element={<ProtectedRoute><Classes /></ProtectedRoute>} />
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
      <AiChatWidget />
      <RoomPresenceBar />
    </AuthProvider>
  );
}

export default App;
