import { DragEvent, FC, ReactNode, useState } from "react";

type Props = {
    onDropFile: (file: File) => void;
    children: ReactNode;
};

const DropZone: FC<Props> = ({ onDropFile, children }) => {
    const [isDragActive, setIsDragActive] = useState<boolean>(false);

    const onDragEnter = (e: DragEvent<HTMLDivElement>) => {
        if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
            setIsDragActive(true);
        }
    };

    const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    setIsDragActive(false);
    };

    const onDrop = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragActive(false);
        if (e.dataTransfer.files !== null && e.dataTransfer.files.length > 0) {
        if (e.dataTransfer.files.length === 1) {
            onDropFile(e.dataTransfer.files[0]);
        } else {
            alert("ファイルは１個まで！");
        }
        e.dataTransfer.clearData();
        }
    };

    return (
        <div
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        >
        {children}
        </div>
    );
};

export default DropZone;