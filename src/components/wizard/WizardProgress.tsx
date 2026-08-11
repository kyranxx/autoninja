import { useTranslations } from "next-intl";
import { CheckIcon } from "@/components/ui/Icons";

interface WizardProgressProps {
  currentStep: number;
  steps: { id: number; nameKey: string; icon: string }[];
  onStepClick: (id: number) => void;
}

function StepIcon({ stepId }: { stepId: number }) {
  return <span aria-hidden="true" className="text-sm font-bold">{stepId}</span>;
}

export function WizardProgress({
  currentStep,
  steps,
  onStepClick,
}: WizardProgressProps) {
  const t = useTranslations("addListing");
  const totalSteps = steps.length;
  const normalizedStep = Math.min(Math.max(currentStep, 1), totalSteps || 1);
  const progressPercent =
    totalSteps > 0 ? Math.round((normalizedStep / totalSteps) * 100) : 100;
  const activeStep = steps.find((step) => step.id === normalizedStep);

  return (
    <div className="mb-8">
      <div className="mb-4 rounded-xl border border-border-subtle bg-background-secondary p-3">
        <div className="flex items-center justify-between text-xs font-semibold text-text-secondary">
          <span>{t("stepProgress", { current: normalizedStep, total: totalSteps })}</span>
          <span>{progressPercent}%</span>
        </div>
        <div
          className="mt-2 h-2 rounded-full bg-surface"
          role="progressbar"
          aria-label={t("stepProgress", { current: normalizedStep, total: totalSteps })}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-valuenow={normalizedStep}
        >
          <div
            className="h-2 rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        {activeStep ? (
          <p className="mt-2 text-xs text-text-secondary">
            {t("currentStep")}: <span className="font-semibold text-text-primary">{t(activeStep.nameKey)}</span>
          </p>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-1">
        {steps.map((step, index) => (
          <div key={step.id} className="flex flex-1 flex-col items-center">
            <div className="relative flex w-full items-center">
              {index > 0 && (
                <div
                  aria-hidden="true"
                  className={`absolute left-0 right-1/2 h-0.5 ${
                    currentStep >= step.id ? "bg-accent" : "bg-border"
                  }`}
                />
              )}
              {index < steps.length - 1 && (
                <div
                  aria-hidden="true"
                  className={`absolute left-1/2 right-0 h-0.5 ${
                    currentStep > step.id ? "bg-accent" : "bg-border"
                  }`}
                />
              )}

              <button
                type="button"
                aria-label={t(step.nameKey)}
                aria-current={currentStep === step.id ? "step" : undefined}
                onClick={() => {
                  if (step.id < currentStep) onStepClick(step.id);
                }}
                disabled={step.id > currentStep}
                className={`relative z-10 mx-auto flex size-10 items-center justify-center rounded-full transition-all ${
                  currentStep === step.id
                    ? "scale-110 bg-accent text-white shadow-lg"
                    : currentStep > step.id
                      ? "cursor-pointer bg-accent text-white hover:scale-105"
                      : "bg-surface text-secondary"
                }`}
              >
                {currentStep > step.id ? (
                  <CheckIcon aria-hidden="true" className="size-5" />
                ) : (
                  <StepIcon stepId={step.id} />
                )}
              </button>
            </div>
            <span
              className={`mt-2 hidden text-xs font-medium sm:block ${
                currentStep >= step.id ? "text-primary" : "text-secondary"
              }`}
            >
              {t(step.nameKey)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
