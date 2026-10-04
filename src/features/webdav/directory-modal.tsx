import { normalizeDirectoryUrl } from '@/features/webdav/browser-model';
import { styles } from '@/features/webdav/browser-styles';
import { testWebDavConnection } from '@/features/webdav/client';
import { useTranslation } from '@/shared/i18n/index';
import { modalAnimationType } from '@/shared/theme/motion';
import { type AppColors } from '@/shared/theme/theme';
import { ToastViewport, useToast } from '@/shared/ui/app-toast';
import { X } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Text, TextInput, View } from 'react-native';

export function DirectoryModal({
  visible,
  editing,
  colors,
  einkOptimization,
  form,
  urlInvalid,
  onChange,
  onClose,
  onSave,
}: {
  visible: boolean;
  editing: boolean;
  colors: AppColors;
  einkOptimization: boolean;
  form: { name: string; url: string; username: string; password: string };
  urlInvalid: boolean;
  onChange: (form: { name: string; url: string; username: string; password: string }) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const { t } = useTranslation();
  const showToast = useToast();
  const [testing, setTesting] = useState(false);
  const testConnection = async () => {
    const url = form.url.trim();
    if (!url) {
      showToast(t('webdavConnectionFailedToast'));
      return;
    }
    setTesting(true);
    try {
      await testWebDavConnection({
        url: normalizeDirectoryUrl(url),
        username: form.username.trim() || undefined,
        password: form.password || undefined,
      });
      showToast(t('webdavConnectionSuccessToast'));
    } catch {
      showToast(t('webdavConnectionFailedToast'));
    }
    setTesting(false);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType={modalAnimationType(einkOptimization)}
      onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={[styles.modalCard, { borderColor: colors.border, backgroundColor: colors.surface }]}>
          <View style={styles.modalHeader}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>
              {editing ? t('editDirectory') : t('addDirectory')}
            </Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('close')}
              onPress={onClose}
              style={styles.modalClose}>
              <X size={22} color={colors.text} />
            </Pressable>
          </View>
          <LabeledInput
            colors={colors}
            label={t('directoryName')}
            value={form.name}
            onChangeText={(name) => onChange({ ...form, name })}
            placeholder={t('directoryNamePlaceholder')}
          />
          <LabeledInput
            colors={colors}
            label={t('directoryAddress')}
            value={form.url}
            onChangeText={(url) => onChange({ ...form, url })}
            placeholder="https://example.com/dav/books/"
            invalid={urlInvalid}
          />
          <LabeledInput
            colors={colors}
            label={t('username')}
            value={form.username}
            onChangeText={(username) => onChange({ ...form, username })}
            placeholder={t('optional')}
          />
          <LabeledInput
            colors={colors}
            label={t('password')}
            value={form.password}
            onChangeText={(password) => onChange({ ...form, password })}
            placeholder={t('optional')}
            secureTextEntry
          />
          <View style={styles.modalActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="测试 WebDAV 连接"
              disabled={testing}
              onPress={testConnection}
              style={({ pressed }) => [
                styles.testButton,
                { borderColor: colors.border, backgroundColor: colors.surface },
                testing && styles.disabledControl,
                pressed && styles.pressed,
              ]}>
              {testing ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={[styles.testButtonText, { color: colors.text }]}>{t('testConnection')}</Text>
              )}
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={editing ? t('saveChanges') : t('saveDirectory')}
              onPress={onSave}
              style={({ pressed }) => [
                styles.saveButton,
                { backgroundColor: colors.accent },
                pressed && styles.pressed,
              ]}>
              <Text style={[styles.saveButtonText, { color: colors.surface }]}>
                {editing ? t('saveChanges') : t('saveDirectory')}
              </Text>
            </Pressable>
          </View>
        </View>
        <ToastViewport colors={colors} />
      </View>
    </Modal>
  );
}

function LabeledInput({
  label,
  colors,
  value,
  onChangeText,
  placeholder,
  secureTextEntry,
  invalid,
}: {
  label: string;
  colors: AppColors;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  secureTextEntry?: boolean;
  invalid?: boolean;
}) {
  return (
    <View style={styles.inputGroup}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textSecondary}
        secureTextEntry={secureTextEntry}
        autoCapitalize="none"
        autoCorrect={false}
        style={[styles.input, { borderColor: invalid ? colors.danger : colors.border, color: colors.text }]}
      />
    </View>
  );
}
