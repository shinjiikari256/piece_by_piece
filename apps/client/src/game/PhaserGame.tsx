import { useEffect, useRef } from "react";
import Phaser from "phaser";
import type { PublicCase as CaseFile } from "../../../../shared/public-case";
import { createSceneHost } from "../state/scene-host";
import { OfficeScene } from "./OfficeScene";

export function PhaserGame({ caseFile }: { caseFile: CaseFile }) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // холст занимает всю сцену; что показывать — решает камера (OfficeScene.fitCamera)
    const game = new Phaser.Game({
      type: Phaser.AUTO,
      parent: host.current!,
      pixelArt: true,
      backgroundColor: "#2b231c",
      scale: { mode: Phaser.Scale.RESIZE },
      banner: false,
      // Phaser не должен трогать фокус окна и ловить клики вне холста:
      // во встроенном браузере VS Code это «съедало» клики по кнопкам интерфейса
      autoFocus: false,
      input: { windowEvents: false },
      callbacks: {
        preBoot: (g) => {
          g.registry.set("caseFile", caseFile);
          g.registry.set("host", createSceneHost());
        },
      },
      scene: [OfficeScene],
    });
    return () => game.destroy(true);
  }, [caseFile]);

  return <div ref={host} className="phaser-host" />;
}
