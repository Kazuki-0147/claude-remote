import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTheme } from '../../theme.js';
import { useI18n } from '../../lib/i18n.js';
import { Icon } from '../Icon.js';

const COMMANDS = [
  { name: '/help', description: '显示帮助信息', icon: 'help-circle' },
  { name: '/clear', description: '清空当前会话', icon: 'trash-2' },
  { name: '/model', description: '切换模型', icon: 'cpu' },
  { name: '/effort', description: '设置思考程度', icon: 'brain' },
  { name: '/resume', description: '恢复之前的会话', icon: 'corner-up-left' },
  { name: '/stop', description: '停止当前运行', icon: 'square' },
  { name: '/compact', description: '压缩会话历史', icon: 'minimize-2' },
  { name: '/rename', description: '重命名会话', icon: 'edit-3' },
  { name: '/artifacts', description: '管理 Artifacts', icon: 'box' },
  { name: '/loop', description: '循环执行任务', icon: 'repeat' },
  { name: '/config', description: '配置设置', icon: 'settings' },
  { name: '/doctor', description: '诊断问题', icon: 'activity' },
  { name: '/usage-credits', description: '查看用量', icon: 'pie-chart' },
  { name: '/code-review', description: '代码审查', icon: 'file-text' },
  { name: '/simplify', description: '简化代码', icon: 'minimize' },
  { name: '/fast', description: '切换快速模式', icon: 'zap' },
];

export function SlashCommandList({ onSelect, filterText = '' }) {
  const { colors } = useTheme();
  const { t } = useI18n();

  const filtered = COMMANDS.filter((cmd) =>
    filterText === '/' || cmd.name.startsWith(filterText.toLowerCase())
  );

  if (filtered.length === 0) return null;

  return (
    <View
      style={{
        position: 'absolute',
        bottom: '100%',
        left: 0,
        right: 0,
        marginBottom: 8,
        backgroundColor: colors.bubble,
        borderRadius: 16,
        borderCurve: 'continuous',
        maxHeight: 200,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4,
      }}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {filtered.map((cmd) => (
          <Pressable
            key={cmd.name}
            onPress={() => onSelect(cmd.name)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 12,
              backgroundColor: pressed ? colors.glassPressed : 'transparent',
            })}
          >
            <Icon name={cmd.icon} size={20} color={colors.accent} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Text style={{ color: colors.inkStrong, fontSize: 16, fontWeight: '500' }}>
                {cmd.name}
              </Text>
              <Text style={{ color: colors.ink, fontSize: 14, marginTop: 2 }}>
                {cmd.description}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
