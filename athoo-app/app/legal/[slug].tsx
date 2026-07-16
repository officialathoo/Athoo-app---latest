import React from "react";
import { useLocalSearchParams } from "expo-router";
import { DynamicPolicyDocumentScreen } from "@/components/screens/DynamicPolicyDocumentScreen";

export default function DynamicPolicyRoute() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  return <DynamicPolicyDocumentScreen slug={String(slug || "")} />;
}
