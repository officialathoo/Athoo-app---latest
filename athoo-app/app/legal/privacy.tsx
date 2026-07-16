import React from "react";
import { DynamicPolicyDocumentScreen } from "@/components/screens/DynamicPolicyDocumentScreen";
import { LegalDocumentScreen } from "@/components/screens/LegalDocumentScreen";

export default function PrivacyPolicyRoute() {
  return <DynamicPolicyDocumentScreen slug="privacy" fallback={<LegalDocumentScreen kind="privacy" />} />;
}
