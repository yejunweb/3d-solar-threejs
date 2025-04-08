/**
 * 创建标签示例
 */

import { ref } from "vue";
import { labelRenderer as labelRenderer2D, tag as tag2D } from "@/core/tag2D";

export const useTag = (threeObj) => {
  const labelRenderer2DObj = ref(null);

  const handleClickTag = (e) => {
    console.log("点击了", e.target.innerHTML);
  };

  const createTag = (list = []) => {
    list.forEach(({ name, position, modelName, className }) => {
      const label2D = tag2D(name, modelName, className, handleClickTag);
      position.multiplyScalar(threeObj.modelScale);
      label2D.position.copy(position);
      threeObj.scene.add(label2D);
    });

    if (!labelRenderer2DObj.value) {
      labelRenderer2DObj.value = labelRenderer2D(threeObj.container);
    }

    return labelRenderer2DObj;
  };

  const renderTag = (scene, camera) => {
    return labelRenderer2DObj.value?.render(
      scene ?? threeObj.scene,
      camera ?? threeObj.camera
    );
  };

  return {
    createTag,
    renderTag,
  };
};
