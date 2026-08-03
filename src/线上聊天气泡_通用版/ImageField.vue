<script setup lang="ts">
const props = defineProps<{
  label: string;
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
  error: [message: string];
}>();

const inputRef = ref<HTMLInputElement | null>(null);
const embedded = computed(() => /^data:image\//i.test(props.modelValue));
const displayValue = computed(() => embedded.value ? '' : props.modelValue);

function chooseFile() {
  inputRef.value?.click();
}

function readFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取图片失败'));
    reader.readAsDataURL(file);
  });
}

async function onFile(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!file.type.startsWith('image/')) {
    emit('error', `${props.label}：请选择图片文件。`);
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    emit('error', `${props.label}：图片超过 5MB，请先压缩后再导入。`);
    return;
  }
  try {
    emit('update:modelValue', await readFile(file));
  } catch {
    emit('error', `${props.label}：读取图片失败。`);
  }
}
</script>

<template>
  <div class="fhbc-image-field">
    <div class="fhbc-image-head">
      <span>{{ label }}</span>
      <span v-if="embedded" class="fhbc-local-tag">本地图片已嵌入</span>
    </div>
    <div class="fhbc-image-control">
      <span class="fhbc-image-preview">
        <img v-if="modelValue" :src="modelValue" alt="" />
        <span v-else>无</span>
      </span>
      <input
        class="fhbc-input"
        type="url"
        :value="displayValue"
        :placeholder="embedded ? '已使用本地图片；输入链接可替换' : '图片链接或选择本地文件'"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <button type="button" class="fhbc-mini-button" @click="chooseFile">选择文件</button>
      <button v-if="modelValue" type="button" class="fhbc-icon-button" title="清除图片" @click="emit('update:modelValue', '')">×</button>
      <input ref="inputRef" class="fhbc-hidden" type="file" accept="image/*" @change="onFile" />
    </div>
  </div>
</template>
