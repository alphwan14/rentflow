import type { Metadata } from "next";
import { NameBuildingForm } from "./forms";
import { Step } from "./step";

export const metadata: Metadata = { title: "Name your building" };

export default function OnboardingStart() {
  return (
    <>
      <Step n={1} title="Name your building" sub="The name tenants and your caretaker know it by." />
      <NameBuildingForm />
    </>
  );
}
