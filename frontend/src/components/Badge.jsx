const styles = {
  needs_shooting:  { background: '#D64A17', color: '#fff' },
  ready_to_edit:   { background: '#E0F2E1', color: '#174D21' },
  done:            { background: '#EBE6DD', color: '#857D70' },
  // v21 Guide flow
  pending_upload:  { background: '#D64A17', color: '#fff' },
  complete:        { background: '#E0F2E1', color: '#174D21' },
};

const labels = {
  needs_shooting:  'Needs Shooting',
  ready_to_edit:   'Ready to Edit',
  done:            'Done',
  pending_upload:  'Upload your clips on Playbook',
  complete:        'Complete',
};

export default function Badge({ status }) {
  return (
    <span style={{
      ...styles[status],
      display: 'inline-block',
      padding: '3px 10px',
      borderRadius: 100,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.03em',
    }}>
      {labels[status]}
    </span>
  );
}
