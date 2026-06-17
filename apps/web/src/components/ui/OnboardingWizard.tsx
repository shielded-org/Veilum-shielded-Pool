import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";

import { useOnboardingSteps } from "../../hooks/use-onboarding";
import { useShieldedStore } from "../../store/use-shielded-store";
import { IconVeilumMark } from "./icons";

export function OnboardingWizard() {
  const location = useLocation();
  const { steps, completedCount, totalSteps, currentStep, shouldShow, allDone } = useOnboardingSteps();
  const setDismissed = useShieldedStore((s) => s.setOnboardingDismissed);

  useEffect(() => {
    if (allDone) setDismissed(true);
  }, [allDone, setDismissed]);

  if (!shouldShow || location.pathname !== "/dashboard") return null;

  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-labelledby="onboarding-title">
      <div className="onboarding-modal">
        <div className="onboarding-modal__head">
          <span className="onboarding-modal__mark" aria-hidden>
            <IconVeilumMark size={24} />
          </span>
          <div>
            <h2 id="onboarding-title">Get started with Veilum</h2>
            <p className="onboarding-modal__lead">
              Four steps to your first private payment on Stellar testnet.
            </p>
          </div>
        </div>

        <div className="onboarding-progress" aria-label={`${completedCount} of ${totalSteps} steps complete`}>
          <div
            className="onboarding-progress__fill"
            style={{ width: `${(completedCount / totalSteps) * 100}%` }}
          />
        </div>

        <ol className="onboarding-steps">
          {steps.map((step, i) => (
            <li
              key={step.id}
              className={`onboarding-step${step.done ? " onboarding-step--done" : ""}${
                step.id === currentStep.id ? " onboarding-step--current" : ""
              }`}
            >
              <span className="onboarding-step__num" aria-hidden>
                {step.done ? "✓" : i + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                <p>{step.description}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="onboarding-modal__actions">
          <Link
            to={currentStep.to}
            className="btn btn-primary"
            onClick={() => setDismissed(true)}
          >
            {currentStep.done ? "Review dashboard" : `Continue: ${currentStep.label}`}
          </Link>
          <button type="button" className="btn btn-secondary" onClick={() => setDismissed(true)}>
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}

export function OnboardingResumeLink() {
  const { allDone, dismissed, completedCount, totalSteps } = useOnboardingSteps();
  const setDismissed = useShieldedStore((s) => s.setOnboardingDismissed);

  if (allDone || !dismissed) return null;

  return (
    <button type="button" className="onboarding-resume" onClick={() => setDismissed(false)}>
      Resume setup · {completedCount}/{totalSteps} complete
    </button>
  );
}
