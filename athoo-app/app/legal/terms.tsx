import React from "react";
import { DynamicPolicyDocumentScreen } from "@/components/screens/DynamicPolicyDocumentScreen";
import { LegalDocumentScreen } from "@/components/screens/LegalDocumentScreen";

export default function TermsRoute() {
  return <DynamicPolicyDocumentScreen slug="terms" fallback={<LegalDocumentScreen kind="terms" />} />;
}
