import { Paper, Typography } from "@mui/material";

function TextWidget({ title, content }: { title: string; content: string | null }) {
  return (
    <Paper sx={{ p: 2, height: "100%" }}>
      <Typography variant="subtitle2" gutterBottom>{title}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-wrap" }}>{content}</Typography>
    </Paper>
  );
}

export default TextWidget;
