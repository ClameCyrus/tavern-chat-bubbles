<script setup lang="ts">
const props = withDefaults(defineProps<{
  label: string;
  modelValue: string;
  fallback?: string;
  placeholder?: string;
}>(), {
  fallback: '#808080',
  placeholder: '#RRGGBB 或 CSS 渐变',
});

const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

const pickerValue = computed(() => {
  const value = props.modelValue.trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : props.fallback;
});
</script>

<template>
  <label class="fhbc-color-field">
    <span>{{ label }}</span>
    <span class="fhbc-color-control">
      <input
        class="fhbc-color-picker"
        type="color"
        :value="pickerValue"
        :aria-label="`${label}色板`"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
      <input
        class="fhbc-input"
        type="text"
        :value="modelValue"
        :placeholder="placeholder"
        @input="emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      />
    </span>
  </label>
</template>
