import React, { useEffect, useRef } from 'react';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, children }: ModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog) {
      if (isOpen && !dialog.open) {
        dialog.showModal();
      } else if (!isOpen && dialog.open) {
        dialog.close();
      }
    }
  }, [isOpen]);

  return (
    <dialog
      ref={dialogRef}
      className="rounded-2xl p-6 bg-white max-w-md w-screen shadow-xl
              backdrop:bg-black/50 transition-all
                justify-self-center self-center items-center fixed transform overflow-hidden
                text-left sm:my-8 sm:w-full sm:max-w-lg"
      onClose={onClose}
    >
      <div className="flex flex-col gap-4">
        {children}
        <button
          onClick={onClose}
          className="self-end px-4 py-2 rounded-md bg-blue-600 text-white hover:bg-blue-700 transition"
        >
          Close
        </button>
      </div>
    </dialog>
  );
};
